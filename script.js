// === GAME CONFIG ===========================================================

// Accurate lat/lng coordinates pulled from Google Maps.
// Each object represents one building/location on the CSUN campus.
const LOCATIONS = [
  {
    name: "Sustainability Center",
    code: "SB",
    grid: "F4",
    position: { lat: 34.2408534, lng: -118.5266263 },
  },
  {
    name: "Jacaranda Hall",
    code: "JD",
    grid: "E5",
    position: { lat: 34.2411177, lng: -118.5289256 },
  },
  {
    name: "Live Oak Hall",
    code: "LO",
    grid: "G4",
    position: { lat: 34.238307, lng: -118.5281976 },
  },
  {
    name: "Redwood Hall",
    code: "RE",
    grid: "F5",
    position: { lat: 34.2419438, lng: -118.5262211 },
  },
  {
    name: "Sequoia Hall",
    code: "SQ",
    grid: "E4",
    position: { lat: 34.2405526, lng: -118.5282433 },
  },
];

// How close (in meters) the user's guess must be to count as "correct"
const CORRECT_DISTANCE_METERS = 50;

// Key for saving scores in localStorage
const SCORES_KEY = "csunMapGameScores";

// === STATE =================================================================

// Main Google map instance
let map;

// Advanced Markers API classes (loaded via google.maps.importLibrary("marker"))
let AdvancedMarkerElement;
let PinElement;

let currentIndex = 0;      // which location (round) the player is on
let correctCount = 0;      // how many they've gotten right so far
let guessingEnabled = false;

// Handles for the *last* round (mostly used for the bounce timeout)
let guessMarker = null;
let targetMarker = null;
let highlightCircle = null;

// Arrays to keep ALL markers/circles for the whole game,
// so we can clear everything when a new game starts.
let allGuessMarkers = [];
let allTargetMarkers = [];
let allHighlightCircles = [];

let timerInterval = null;
let startTime = null;

// DOM elements
let startBtn;
let promptEl;
let statusEl;
let scoreEl;
let timerEl;
let highScoreEl;

// === INIT MAP ==============================================================

async function initMap() {
  // Re-centered on the average of your building coordinates so everything
  // stays on screen better (slightly north/east of your old center).
  const CSUN_CENTER = { lat: 34.24055, lng: -118.52765 };

  const { Map } = await google.maps.importLibrary("maps");
  ({ AdvancedMarkerElement, PinElement } = await google.maps.importLibrary(
    "marker"
  ));

  map = new Map(document.getElementById("map"), {
    center: CSUN_CENTER,
    zoom: 16.8,
    mapId: "3d6d062a1a2f5d60d6dc3f28",
    gestureHandling: "none",
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    keyboardShortcuts: false,
    draggable: false,
    scrollwheel: false,
    disableDoubleClickZoom: true,
  });

  wireUpUI();
  loadScoresFromStorage();

  map.addListener("dblclick", (e) => {
    if (!guessingEnabled) return;
    handleGuess(e.latLng);
  });
}

window.initMap = initMap;

// === UI SETUP ==============================================================

function wireUpUI() {
  startBtn = document.getElementById("startBtn");
  promptEl = document.getElementById("locationPrompt");
  statusEl = document.getElementById("statusMessage");
  scoreEl = document.getElementById("scoreDisplay");
  timerEl = document.getElementById("timerDisplay");
  highScoreEl = document.getElementById("highScoreDisplay");

  startBtn.addEventListener("click", startGame);
}

// === GAME LOGIC ============================================================

function startGame() {
  // Reset game state
  currentIndex = 0;
  correctCount = 0;
  updateScore();

  // Clear *all* markers/circles from any previous game.
  clearRoundGraphics();

  statusEl.textContent = "";
  promptEl.textContent =
    "Game started! Double-click on the map where you think the first location is.";

  startBtn.disabled = true;

  // Start timer for this run
  startTimer();

  // Start the first round
  startRound();
}

function startRound() {
  if (currentIndex >= LOCATIONS.length) {
    endGame();
    return;
  }

  const loc = LOCATIONS[currentIndex];
  guessingEnabled = true;

  // Static map
  promptEl.textContent =
    `Round ${currentIndex + 1} of ${LOCATIONS.length}: ` +
    `Double-click where you think ${loc.name} (${loc.grid}) is.`;
}

function handleGuess(latLng) {
  guessingEnabled = false;

  const loc = LOCATIONS[currentIndex];

  // Use Google Maps geometry library to compute distance in meters
  const locLatLng = new google.maps.LatLng(
    loc.position.lat,
    loc.position.lng
  );
  const distance =
    google.maps.geometry.spherical.computeDistanceBetween(
      latLng,
      locLatLng
    );

  const isCorrect = distance <= CORRECT_DISTANCE_METERS;

  if (isCorrect) {
    correctCount++;
    statusEl.textContent = "Correct!";
  } else {
    statusEl.textContent =
      "Incorrect. The correct area is highlighted in red.";
  }

  updateScore();

  // Show markers / circle for this round:
  // - Correct location marker (animated)
  // - Customized advanced marker at user's guess
  // - Circle showing "correct" area
  //
  // We keep all of them on the map until the *next* game, but we also
  // store them in arrays so we can clear everything when a new game starts.
  showRoundMarkers(loc, latLng, isCorrect);

  // Move to next location (or end game)
  currentIndex++;

  if (currentIndex < LOCATIONS.length) {
    // Brief pause so the user can see the result & markers
    promptEl.textContent = "Get ready for the next location...";
    setTimeout(startRound, 1500); // delay for pacing
  } else {
    // Last round completed
    setTimeout(endGame, 1500);
  }
}

function endGame() {
  guessingEnabled = false;
  startBtn.disabled = false;

  const totalTime = stopTimer();

  const message =
    `You got ${correctCount} out of ${LOCATIONS.length} correct.` +
    (totalTime !== null
      ? ` Your time: ${totalTime.toFixed(1)} seconds.`
      : "");

  alert(message);

  promptEl.textContent = 'Game over. Click "Start Game" to play again.';
}

// === MARKERS & HIGHLIGHTS ================================================

function showRoundMarkers(location, guessLatLng, isCorrect) {
  // Correct location marker (DROP, then optional BOUNCE)
  targetMarker = new google.maps.Marker({
    map,
    position: location.position,
    animation: google.maps.Animation.DROP,
    title: `${location.name} (${location.grid})`,
  });
  allTargetMarkers.push(targetMarker);

  if (isCorrect) {
    targetMarker.setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(() => {
      if (targetMarker) {
        targetMarker.setAnimation(null);
      }
    }, 2000);
  }

  // Customized Advanced Marker for user's guess
  const guessPin = new PinElement({
    scale: 1.1,
    background: isCorrect ? "#22c55e" : "#ef4444",
    borderColor: isCorrect ? "#16a34a" : "#b91c1c",
    glyphColor: "#ffffff",
  });

  guessMarker = new AdvancedMarkerElement({
    position: guessLatLng,
    title: isCorrect ? "Your guess (correct)" : "Your guess (incorrect)",
    content: guessPin.element,
    map,
  });
  allGuessMarkers.push(guessMarker);

  // Circle showing the "correct area"
  highlightCircle = new google.maps.Circle({
    center: location.position,
    radius: CORRECT_DISTANCE_METERS,
    map,
    strokeOpacity: 0.9,
    strokeWeight: 2,
    strokeColor: isCorrect ? "#22c55e" : "#ef4444",
    fillOpacity: 0.25,
    fillColor: isCorrect ? "#22c55e" : "#ef4444",
  });
  allHighlightCircles.push(highlightCircle);
}

// Clear ALL markers/circles from previous game
function clearRoundGraphics() {
  // Clear all guess markers
  allGuessMarkers.forEach((m) => {
    m.map = null;
  });
  allGuessMarkers = [];

  // Clear all correct-location markers
  allTargetMarkers.forEach((m) => {
    m.setMap(null);
  });
  allTargetMarkers = [];

  // Clear all circles
  allHighlightCircles.forEach((c) => {
    c.setMap(null);
  });
  allHighlightCircles = [];

  // Reset last-round handles
  guessMarker = null;
  targetMarker = null;
  highlightCircle = null;
}

// === TIMER ================================================================

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  startTime = performance.now();
  timerInterval = setInterval(updateTimerDisplay, 100);
}

function stopTimer() {
  if (!startTime) return null;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const elapsedMs = performance.now() - startTime;
  startTime = null;
  const seconds = elapsedMs / 1000;
  timerEl.textContent = `Time: ${seconds.toFixed(1)} s`;
  return seconds;
}

function updateTimerDisplay() {
  if (!startTime) return;
  const elapsedMs = performance.now() - startTime;
  const seconds = elapsedMs / 1000;
  timerEl.textContent = `Time: ${seconds.toFixed(1)} s`;
}

// === HIGH SCORES (WITH PREVIOUS SCORES, BEST AT TOP) =======================

function loadScoresFromStorage() {
  try {
    const saved = localStorage.getItem(SCORES_KEY);
    if (!saved) {
      highScoreEl.textContent = "High Scores: N/A";
      return;
    }
    const scores = JSON.parse(saved);
    if (!Array.isArray(scores) || scores.length === 0) {
      highScoreEl.textContent = "High Scores: N/A";
      return;
    }
    renderScoreBoard(scores);
  } catch {
    highScoreEl.textContent = "High Scores: Unavailable";
  }
}

function saveScore(correct, total, timeSeconds) {
  try {
    const saved = localStorage.getItem(SCORES_KEY);
    let scores = [];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        scores = parsed;
      }
    }

    scores.push({
      correct,
      total,
      timeSeconds: typeof timeSeconds === "number" ? timeSeconds : null,
      timestamp: Date.now(),
    });

    // Sort scores so the "best" ones are at the top:
    scores.sort((a, b) => {
      if (b.correct !== a.correct) {
        return b.correct - a.correct;
      }
      if (a.timeSeconds == null && b.timeSeconds == null) return 0;
      if (a.timeSeconds == null) return 1;
      if (b.timeSeconds == null) return -1;
      return a.timeSeconds - b.timeSeconds;
    });

    // Keep only top 10 scores in storage
    scores = scores.slice(0, 10);

    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
    renderScoreBoard(scores);
  } catch {
    // Ignore storage errors
  }
}

function renderScoreBoard(scores) {
  if (!scores || scores.length === 0) {
    highScoreEl.textContent = "High Scores: none yet";
    return;
  }

  const lines = ["High Scores:"];

  scores.forEach((s, index) => {
    const place = index + 1;
    let line = `${place}. ${s.correct}/${s.total}`;
    if (typeof s.timeSeconds === "number") {
      line += ` - ${s.timeSeconds.toFixed(1)} s`;
    }
    lines.push(line);
  });

  highScoreEl.innerHTML = lines.join("<br>");
}

// === HELPERS ===============================================================

function updateScore() {
  scoreEl.textContent = `Score: ${correctCount} / ${LOCATIONS.length}`;
}
