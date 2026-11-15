//@input Component.ScriptComponent duet
//@input Component.Text statusText
//@input Asset.VoiceMLModule vmlModule

// Listens from the moment the lens is running. A melody starts when the
// wearer asks Delphi to play. VoiceML is the Spectacles 2024 path. AsrModule
// is only used if VoiceML never opens the microphone.
var asr;
var vml;
var listening = false;
var alive = true;
var retryPending = false;
var generation = 0;
var lastPartial = "";
var lastSeen = "";
var lastAsk = -10;
var voiceMlBound = false;
var gaveUpOnVoiceMl = false;
var voiceMlAttempt = 0;
var NAME = "(?:delphi|delfi|delphy|duffy|duffie|jeffy|jeffi)";

function report(kind, message) {
    if (message) print("[Delphi] " + message);
    if (script.api && typeof script.api.onReport === "function") {
        script.api.onReport(kind, message);
        return;
    }
    if (script.statusText) script.statusText.text = message;
}

function spokenOf(text) {
    return text.toLowerCase().replace(/[^a-z ]/g, " ").trim().replace(/ +/g, " ");
}

function asksForMelody(text) {
    var spoken = spokenOf(text);
    if (!spoken) return false;
    var named = new RegExp("\\b" + NAME + "\\b").test(spoken);
    var play = /\bplay(?:ing|ed)?\b/.test(spoken);
    var music = /\b(?:melody|melodies|music|song|songs)\b/.test(spoken);
    if (play && music) return true;
    if (named && (play || music)) return true;
    return new RegExp("\\bhey " + NAME + " please\\b").test(spoken);
}

function requestMelody(why) {
    var now = getTime();
    if (now - lastAsk < 4) return;
    if (!script.duet || !script.duet.api || typeof script.duet.api.playAskedMelody !== "function") {
        print("[Delphi] Melody is not wired");
        scheduleRetry();
        return;
    }
    lastAsk = now;
    print("[Delphi] Heard: " + why);
    try {
        script.duet.api.playAskedMelody();
    } catch (error) {
        print("[Delphi] " + error);
        report("idle", "");
    }
}

function considerText(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || trimmed === lastSeen) return;
    lastSeen = trimmed;
    if (onGlasses()) print("[Delphi] " + trimmed);
    if (!asksForMelody(trimmed) || trimmed === lastPartial) return;
    lastPartial = trimmed;
    report("hearing", "Hearing");
    requestMelody(trimmed);
}

function considerKeywords(eventArgs) {
    var responses;
    try { responses = eventArgs.getKeywordResponses(); } catch (error) { return; }
    if (!responses) return;
    var play = false;
    var music = false;
    var named = false;
    for (var i = 0; i < responses.length; i++) {
        var words = responses[i] && responses[i].keywords;
        if (!words) continue;
        for (var j = 0; j < words.length; j++) {
            var word = String(words[j] || "").toLowerCase();
            if (!word || word.indexOf("#snap_error") === 0) continue;
            if (word === "play") play = true;
            else if (word === "melody") music = true;
            else if (word === "delphi") named = true;
        }
    }
    if ((play && music) || (named && play) || (named && music)) requestMelody("keyword");
}

function moduleOrNull() {
    return script.vmlModule || null;
}

function onGlasses() {
    try {
        return !!(global.deviceInfoSystem && !global.deviceInfoSystem.isEditor());
    } catch (error) {
        return false;
    }
}

function stop(silent) {
    generation++;
    listening = false;
    lastPartial = "";
    try { if (asr) Promise.resolve(asr.stopTranscribing()).catch(function () {}); } catch (error) { /* Already stopped. */ }
    try { if (vml && vml.stopListening) vml.stopListening(); } catch (error) { /* Already stopped. */ }
    if (!silent) report("off", "Voice off");
}

function bindVoiceML() {
    if (voiceMlBound || !vml) return;
    voiceMlBound = true;
    vml.onListeningEnabled.add(function () {
        if (!alive || gaveUpOnVoiceMl) return;
        openVoiceML();
    });
    vml.onListeningDisabled.add(function () {
        if (!alive || gaveUpOnVoiceMl) return;
        listening = false;
        report("unavailable", "Voice unavailable");
        scheduleRetry();
    });
    vml.onListeningError.add(function (eventError) {
        var code = eventError && eventError.error;
        var description = eventError && eventError.description;
        print("[Delphi] VoiceML " + code + " " + description);
        if (!alive || gaveUpOnVoiceMl) return;
        listening = false;
        try { vml.stopListening(); } catch (error) { /* Already stopped. */ }
        if (voiceMlAttempt < 2) {
            openVoiceML();
            return;
        }
        gaveUpOnVoiceMl = true;
        startAsr();
    });
    vml.onListeningUpdate.add(function (eventArgs) {
        if (!listening || gaveUpOnVoiceMl || !eventArgs) return;
        if (eventArgs.transcription) considerText(eventArgs.transcription);
        considerKeywords(eventArgs);
    });
}

function openVoiceML() {
    if (!vml || listening || gaveUpOnVoiceMl) return;
    var options = VoiceML.ListeningOptions.create();
    options.languageCode = "en-US";
    options.speechRecognizer = "SPEECH_RECOGNIZER";
    options.shouldReturnAsrTranscription = true;
    options.shouldReturnInterimAsrTranscription = true;
    options.addSpeechContext(["Delphi", "play", "melody", "music", "song"], 10);
    if (voiceMlAttempt === 0) {
        var keywords = VoiceML.NlpKeywordModelOptions.create();
        keywords.addKeywordGroup("play", ["play", "playing", "played"]);
        keywords.addKeywordGroup("melody", ["melody", "music", "song"]);
        keywords.addKeywordGroup("delphi", ["delphi", "delfi", "delphy", "duffy"]);
        options.nlpModels = [keywords];
    }
    voiceMlAttempt++;
    vml.startListening(options);
    listening = true;
    report("listening", "Delphi is listening");
}

function startVoiceML() {
    if (!vml) vml = moduleOrNull();
    if (!vml || !vml.onListeningEnabled || typeof VoiceML === "undefined") return false;
    bindVoiceML();
    if (onGlasses()) {
        openVoiceML();
        var kick = script.createEvent("DelayedCallbackEvent");
        kick.bind(function () {
            if (!alive || listening || gaveUpOnVoiceMl) return;
            openVoiceML();
        });
        kick.reset(1);
        return true;
    }
    var fallback = script.createEvent("DelayedCallbackEvent");
    fallback.bind(function () {
        if (!alive || listening || gaveUpOnVoiceMl) return;
        gaveUpOnVoiceMl = true;
        startAsr();
    });
    fallback.reset(3);
    return true;
}

function startAsr() {
    if (listening) return;
    if (!script.duet) {
        scheduleRetry();
        return;
    }
    var run = ++generation;
    try {
        var asrLib = asr || require("LensStudio:AsrModule");
        asr = asrLib;
        var Options = (typeof AsrModule !== "undefined" && AsrModule.AsrTranscriptionOptions)
            ? AsrModule.AsrTranscriptionOptions
            : asrLib.AsrTranscriptionOptions;
        var Mode = (typeof AsrModule !== "undefined" && AsrModule.AsrMode)
            ? AsrModule.AsrMode
            : asrLib.AsrMode;
        var options = Options.create();
        options.silenceUntilTerminationMs = onGlasses() ? 1200 : 700;
        options.mode = onGlasses() ? Mode.HighAccuracy : Mode.Balanced;
        options.onTranscriptionUpdateEvent.add(function (event) {
            if (!listening || run !== generation || !event.text) return;
            considerText(event.text);
        });
        options.onTranscriptionErrorEvent.add(function (code) {
            if (run !== generation) return;
            stop(true);
            print("[Delphi] ASR " + code);
            report("unavailable", "Voice unavailable (" + code + ")");
            scheduleRetry();
        });
        listening = true;
        Promise.resolve(asr.startTranscribing(options)).catch(function (error) {
            if (run !== generation) return;
            stop(true);
            print("[Delphi] " + error);
            report("unavailable", "Voice unavailable");
            scheduleRetry();
        });
        report("listening", "Delphi is listening");
    } catch (error) {
        listening = false;
        print("[Delphi] " + error);
        report("unavailable", "Voice unavailable");
        scheduleRetry();
    }
}

function start() {
    if (listening) return;
    if (!script.duet) {
        scheduleRetry();
        return;
    }
    if (!gaveUpOnVoiceMl && startVoiceML()) return;
    startAsr();
}

function scheduleRetry() {
    if (!alive || listening || retryPending) return;
    retryPending = true;
    var retry = script.createEvent("DelayedCallbackEvent");
    retry.bind(function () {
        retryPending = false;
        if (alive && !listening) start();
    });
    retry.reset(2);
}

script.api.startListening = start;
script.api.stopListening = function () { stop(false); };
script.api.toggleListening = function () { if (listening) stop(false); else start(); };
script.createEvent("OnStartEvent").bind(function () { start(); });
script.createEvent("OnEnableEvent").bind(function () { if (alive && !listening) start(); });
script.createEvent("OnDisableEvent").bind(function () { stop(true); });
script.createEvent("OnDestroyEvent").bind(function () {
    alive = false;
    stop(true);
});
