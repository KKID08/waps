// Turn-by-turn navigation engine: GPS tracking, snapping, progress, voice.
import { haversine, bearing, closestOnLine, formatDistance } from './util.js';

const OFF_ROUTE_THRESHOLD = 45; // metres before we consider a reroute
const ARRIVE_THRESHOLD = 25; // metres to destination = arrived

export class Navigator {
  constructor({ onUpdate, onReroute, onArrive, speak }) {
    this.onUpdate = onUpdate;
    this.onReroute = onReroute;
    this.onArrive = onArrive;
    this.speak = speak;
    this.active = false;
    this.watchId = null;
    this.route = null;
    this.spokenFor = new Set();
    this.offRouteCount = 0;
    this.lastPos = null;
  }

  start(route) {
    this.route = route;
    this.active = true;
    this.spokenFor = new Set();
    this.offRouteCount = 0;

    if (!('geolocation' in navigator)) {
      this.onUpdate?.({ error: 'Standort wird nicht unterstützt.' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPosition(pos),
      (err) => this.onUpdate?.({ error: geoError(err) }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }

  // Feed a synthetic position (used for the simulation/demo mode).
  feed(coord, heading) {
    if (!this.active) return;
    this._process(coord, heading, 0);
  }

  stop() {
    this.active = false;
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  _onPosition(pos) {
    const coord = [pos.coords.longitude, pos.coords.latitude];
    const heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
    this._process(coord, heading, pos.coords.accuracy);
  }

  _process(coord, heading, accuracy) {
    if (!this.route) return;
    const coords = this.route.coordinates;
    const snap = closestOnLine(coords, coord);

    // Off-route handling with hysteresis to avoid spurious reroutes.
    if (snap.distance > OFF_ROUTE_THRESHOLD) {
      this.offRouteCount++;
      if (this.offRouteCount >= 2) {
        this.offRouteCount = 0;
        this.onReroute?.(coord);
        return;
      }
    } else {
      this.offRouteCount = 0;
    }

    // Distance remaining = from snapped point to the end along the line.
    let remaining = haversine(snap.snapped, coords[snap.index + 1] || snap.snapped);
    for (let i = snap.index + 1; i < coords.length - 1; i++) {
      remaining += haversine(coords[i], coords[i + 1]);
    }

    // Arrival check.
    const dest = coords[coords.length - 1];
    if (haversine(coord, dest) < ARRIVE_THRESHOLD) {
      this.onArrive?.();
      this.stop();
      return;
    }

    // Find the next maneuver ahead of the snapped position.
    const next = this._nextManeuver(snap.index);
    let distToManeuver = 0;
    if (next) {
      distToManeuver = haversine(snap.snapped, coords[snap.index + 1] || snap.snapped);
      for (let i = snap.index + 1; i < next.shapeIndex; i++) {
        distToManeuver += haversine(coords[i], coords[i + 1]);
      }
      this._maybeSpeak(next, distToManeuver);
    }

    // Derive heading from movement if the device didn't supply one.
    let course = heading;
    if (course == null && this.lastPos) {
      const moved = haversine(this.lastPos, coord);
      if (moved > 2) course = bearing(this.lastPos, coord);
    }
    if (course == null) course = this._lineBearing(snap.index);
    this.lastPos = coord;

    // Remaining time scaled from the route's overall average speed.
    const frac = this.route.distance ? remaining / this.route.distance : 0;
    const remainingTime = Math.round(this.route.duration * frac);

    this.onUpdate?.({
      coord,
      snapped: snap.snapped,
      heading: course,
      accuracy,
      remaining,
      remainingTime,
      next,
      distToManeuver,
      traveled: coords.slice(0, snap.index + 1).concat([snap.snapped]),
    });
  }

  _nextManeuver(shapeIndex) {
    for (const m of this.route.maneuvers) {
      if (m.shapeIndex > shapeIndex + 0.0001) return m;
    }
    return this.route.maneuvers[this.route.maneuvers.length - 1] || null;
  }

  _lineBearing(i) {
    const coords = this.route.coordinates;
    const a = coords[i];
    const b = coords[Math.min(i + 1, coords.length - 1)];
    return bearing(a, b);
  }

  _maybeSpeak(maneuver, dist) {
    const key = maneuver.shapeIndex;
    const arrival = maneuver.isArrival;
    // Two cues: an early heads-up and a final "now" instruction.
    const farKey = `${key}:far`;
    const nowKey = `${key}:now`;
    if (dist < 300 && dist > 80 && !this.spokenFor.has(farKey)) {
      this.spokenFor.add(farKey);
      this.speak?.(`In ${formatDistance(dist)}: ${maneuver.verbalPre || maneuver.instruction}`);
    } else if (dist < (arrival ? 40 : 60) && !this.spokenFor.has(nowKey)) {
      this.spokenFor.add(nowKey);
      this.speak?.(maneuver.verbalPre || maneuver.instruction);
    }
  }
}

function geoError(err) {
  if (err.code === 1) return 'Standortzugriff verweigert.';
  if (err.code === 2) return 'Standort nicht verfügbar.';
  if (err.code === 3) return 'Standortabfrage Zeitüberschreitung.';
  return 'Standortfehler.';
}
