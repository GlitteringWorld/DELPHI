// Host Lens owns star movement and audio. This script only decides what Delphi plays.
var music = require("./DuetRules");
var stars = [];
var notes = [];
var queued = [];
var nextAnswer = Infinity;
var lastPlayed = 0;
var previous;
var pattern;
var enRoute;
var follow = [];
var sessionEnds = 0;
var gain = 1;
var planner;
var revision = 0;
var pendingPlan;
var ready = false;

function voiceName(zone) {
    var voice = music.voices[zone];
    return voice ? voice.name : "that instrument";
}

function loopLabel(zones) {
    var names = [];
    var seen = {};
    for (var i = 0; i < zones.length; i++) {
        if (seen[zones[i]]) continue;
        seen[zones[i]] = true;
        names.push(voiceName(zones[i]));
    }
    if (!names.length) return "";
    if (names.length === 1) return names[0] + "  \u21bb";
    return names.join("  \u21bb  ");
}

function describePattern(interval) {
    return loopLabel(interval.zones || []);
}

function notify(name, payload) {
    if (typeof script.api[name] === "function") script.api[name](payload);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function beatSeconds() {
    var gaps = notes.slice(1).map(function (note) { return note.ms; })
        .filter(function (ms) { return ms >= 170 && ms <= 1250; })
        .sort(function (a, b) { return a - b; });
    return gaps.length ? clamp(gaps[Math.floor(gaps.length / 2)] / 1000, 0.26, 0.95) : 0.47;
}

function heldIds() {
    return stars.filter(function (star) { return star.held; })
        .map(function (star) { return star.id; });
}

function targetFor(zone) {
    var occupied = heldIds();
    var open = stars.filter(function (star) { return !star.held; });
    if (zone == null) return music.availableStars(stars, occupied, notes)[0];
    return open.find(function (star) { return star.zone === zone; })
        || open.find(function (star) { return star.id === zone; }) || open[0];
}

function stopDolphin() {
    revision++;
    pendingPlan = null;
    pattern = null;
    enRoute = null;
    follow = [];
    queued = [];
    notify("onStop");
    nextAnswer = Infinity;
    notify("onApproach", null);
}

function openSession(seconds) {
    if (!sessionEnds) sessionEnds = getTime() + (seconds > 0 ? seconds : 60);
}

function depart(target, note) {
    if (!target) return false;
    enRoute = { star:target, note:note };
    notify("onApproach", { star:target.id, at:getTime() });
    return true;
}

function armZone(zone, duration) {
    var target = targetFor(zone);
    if (!target) return false;
    return depart(target, {
        zone:zone == null ? target.zone : zone,
        step:target.step,
        gain:0.38 * gain,
        duration:duration > 0 ? duration : 0.8
    });
}

function startPattern(zones, interval, duration) {
    stopDolphin();
    openSession(60);
    pattern = { zones:zones, index:0, interval:interval, duration:duration, next:Infinity };
    return armZone(zones[0], duration);
}

function queueNote(star, note, due) {
    queued.push({ star:star, note:note, due:due });
    if (queued.length === 1) notify("onApproach", { star:star.id, at:due });
}

function onPlayer(id, strength) {
    var star = stars[id];
    if (!ready || !star) return;
    var now = getTime();
    var amount = typeof strength === "number" && isFinite(strength) ? clamp(strength, 0.15, 0.9) : 0.53;
    star.gain = amount;
    if (notes.length === 12) notes.shift();
    notes.push({ id:id, zone:star.zone, step:star.step, gain:amount,
        ms:lastPlayed ? Math.round((now-lastPlayed)*1000) : 0 });
    lastPlayed = now;
    notify("onPlayerNote", { star:id, zone:star.zone, step:star.step });
}

function updateStar(id, x, y, held) {
    var star = stars[id];
    if (!ready || !star || !isFinite(x) || !isFinite(y)) return;
    var zone = music.zoneAt(x, star.zone);
    var step = clamp(Math.round((0.8-y)*14),0,10);
    var changed = zone !== star.zone || step !== star.step;
    star.zone = zone;
    star.step = step;
    star.held = Boolean(held);
    if (changed) notify("onInstrument", { star:id,name:music.voices[zone].name,zone:zone,step:step });
}

function runCue(text) {
    if (!ready || typeof text !== "string") return false;
    var spoken = text.toLowerCase().replace(/[^a-z ]/g, " ").trim().replace(/ +/g, " ")
        .replace(/^(?:hey(?: (?:delphi|delfi|delphy|jeffy|jeffi))?|(?:delphi|delfi|delphy|jeffy|jeffi)) /, "")
        .replace(/(?: please)+$/, "");
    if (/^stop(?: playing| alternating| delphi)?(?: please)?$/.test(spoken)) {
        stopDolphin();
        notify("onStatus", "");
        return true;
    }
    if (/water gong/.test(spoken)) { notify("onStatus", "Soft Gong or Water Glass?"); return true; }
    if (/\bplay\b/.test(spoken) && /\b(?:instrumentary|instrumental|instruments|instrument trees?)\b/.test(spoken)) {
        if (!startPattern([0, 1, 2, 3], 2, 0.8)) return false;
        notify("onStatus", loopLabel([0, 1, 2, 3]));
        return true;
    }
    var listed = spoken.match(/^play (.+) in intervals$/);
    if (listed) {
        var names = listed[1].split(/,| and /);
        var picked = [];
        for (var n = 0; n < names.length; n++) {
            var label = names[n].replace(/^ +| +$/g, "");
            if (!label || label === "this" || label === "that" || label === "this instrument" || label === "that instrument") continue;
            var pickedZone = music.instrumentCue("play " + label);
            if (pickedZone != null) picked.push(pickedZone);
        }
        if (picked.length) {
            if (!startPattern(picked, 2, 0.8)) return false;
            notify("onStatus", loopLabel(picked));
            return true;
        }
    }

    var interval = music.alternatingCue(text) || music.repeatCue(text);
    if (interval) {
        if (!startPattern(interval.zones, interval.interval || interval.duration, interval.duration || 0.8)) return false;
        notify("onStatus", describePattern(interval));
        return true;
    }

    var that = /^play (?:this|that)(?: one| star)?(?: please)?$/.test(spoken);
    if (that && !notes.length) { notify("onStatus", "Play a star first"); return true; }
    var zone = that ? notes[notes.length-1].zone : music.instrumentCue(text);
    var quiet = /^(?:play softly|play soft songs|play something soft|play a soft melody)$/.test(spoken);
    var action = music.parseCue(text) || music.parseCue(spoken);
    if (zone == null && !quiet && !action) return false;
    stopDolphin();
    openSession(60);
    if (quiet) gain = 0.55;
    var target = targetFor(zone == null && quiet && !notes.length ? 0 : zone);
    if (!target) return false;
    var phrase = notes.slice(-6);
    if (!phrase.length) phrase.push({ step:target.step,ms:0,gain:0.48 });
    var beat = beatSeconds();
    var response = music.replyNotes({action:action || "echo",star:target.id},phrase,[target],beat*1000);
    if (!response.length) return false;
    follow = response.slice(1).map(function (note) {
        return { star:target, note:{ zone:zone == null ? note.zone : zone, step:note.step, gain:note.gain * gain, duration:0.8 },
            beat:note.beat * beat };
    });
    if (!depart(target, { zone:zone == null ? response[0].zone : zone, step:response[0].step,
        gain:response[0].gain * gain, duration:0.8 })) return false;
    var voice = music.voices[zone == null ? target.zone : zone];
    notify("onStatus", voice ? voice.name : "Playing");
    return true;
}

function dolphinArrived(starId) {
    if (sessionEnds && getTime() > sessionEnds) {
        stopDolphin();
        notify("onStatus", "");
        sessionEnds = 0;
        return;
    }
    if (!enRoute || !enRoute.star || enRoute.star.id !== starId) return;
    var item = enRoute;
    enRoute = null;
    if (!item.star.held) {
        notify("onDolphinNote", { star:item.star.id, zone:item.note.zone, step:item.note.step,
            gain:item.note.gain, duration:item.note.duration });
    }
    var now = getTime();
    for (var i = 0; i < follow.length; i++) {
        queued.push({ star:follow[i].star, note:follow[i].note, due:now + follow[i].beat });
    }
    follow = [];
    if (!pattern) return;
    pattern.index = (pattern.index + 1) % pattern.zones.length;
    var swim = 0.4;
    var gap = pattern.interval
        ? Math.max(item.note.duration || 0.4, pattern.interval - swim)
        : (item.note.duration || 0.4);
    pattern.next = now + gap;
}

function requestAnswer(now) {
    if (pattern || queued.length || pendingPlan || !notes.length || now < nextAnswer || now-lastPlayed > 4.6) return;
    nextAnswer = now+3.2;
    var phrase = notes.slice(-6);
    var beat = beatSeconds();
    var candidates = music.availableStars(stars,heldIds(),phrase).map(function (star) {
        return { id:star.id,zone:star.zone,step:star.step };
    });
    if (!candidates.length) return;
    var anchor = lastPlayed;
    var lead = now+0.65;
    var due = anchor + Math.max(1,Math.ceil((lead-anchor)/beat))*beat;
    var result = { phrase:phrase,candidates:candidates,beat:beat,due:due,decisionAt:now+(planner ? 0.24 : 0),choice:null };
    pendingPlan = result;
    if (planner) {
        var run = revision;
        Promise.resolve().then(function () {
            return planner({ version:1,events:phrase,stars:candidates,beatMs:Math.round(beat*1000),
                looping:false,previous:previous && previous.action });
        }).then(function (choice) {
            if (revision === run && pendingPlan === result && music.validChoice(choice,candidates)) result.choice = choice;
        }).catch(function () { /* Keep the local musical answer. */ });
    }
}

function update() {
    var now = getTime();
    if (sessionEnds && now > sessionEnds) {
        stopDolphin();
        notify("onStatus", "");
        sessionEnds = 0;
        return;
    }
    if (pattern && !enRoute && pattern.next <= now) {
        armZone(pattern.zones[pattern.index], pattern.duration);
    }
    if (pendingPlan && now >= pendingPlan.decisionAt) {
        var pending = pendingPlan;
        pendingPlan = null;
        var candidates = pending.candidates.filter(function (star) { return !stars[star.id].held; });
        var reply = music.validChoice(pending.choice,candidates) ? pending.choice
            : music.chooseReply(pending.phrase,candidates,pending.beat*1000,previous);
        previous = reply;
        music.replyNotes(reply,pending.phrase,candidates,pending.beat*1000).forEach(function (note) {
            queueNote(stars[note.id],{ zone:note.zone,step:note.step,gain:note.gain*gain },
                pending.due+note.beat*pending.beat);
        });
    }
    if (!queued.length || enRoute || now < queued[0].due) return;
    var entry = queued.shift();
    if (!entry.star.held) {
        notify("onDolphinNote",{ star:entry.star.id,zone:entry.note.zone,step:entry.note.step,
            gain:entry.note.gain,duration:entry.note.duration });
    }
}

script.api.updateStar = updateStar;
script.api.playerPlayed = onPlayer;
function playAskedMelody() {
    notify("onMelody");
    notify("onStatus", "Playing");
    return true;
}

script.api.cue = runCue;
script.api.playAskedMelody = playAskedMelody;
script.api.stopDolphin = stopDolphin;
script.api.dolphinArrived = dolphinArrived;
script.api.openSession = openSession;
script.api.setPlanner = function (callback) { planner = typeof callback === "function" ? callback : null; };
script.createEvent("OnStartEvent").bind(function () {
    [0,1,2,3].forEach(function (id) {
        stars.push({id:id,zone:id,step:5,gain:0.53,held:false,sounding:false});
    });
    ready = true;
    script.createEvent("UpdateEvent").bind(update);
});
