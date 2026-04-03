
// Constants
const UNDO_MAX_STEPS = 256; // Good enough for almost all cases without sacrificing too much memory

const canvas = document.getElementById("main-canvas");
const clearButton = document.getElementById("button-clear-canvas");
const undoButton = document.getElementById("button-undo");
const downloadButton = document.getElementById("button-download-image");
const inputPenColor = document.getElementById("input-pen-color");
const inputAlpha = document.getElementById("input-pen-alpha");
const inputPenSize = document.getElementById("input-pen-size");
const inputWidth = document.getElementById("input-width");
const inputHeight = document.getElementById("input-height");
const inputPathSmoothing = document.getElementById("input-path-smoothing");

const searchParams = new URLSearchParams(document.location.search);
const baseImageURL = searchParams.get("src");
const contextMenus = [];
const context = canvas.getContext("2d");

// Variables
let width = 1120;
let height = 630;
let painting = false;
let undoStack = [];
let redoStack = [];
let penColor = "#000000";
let refBuffer = null;
let contextMenuSubject = "";
let pointerOnCanvas = false;
let penOnly = false;
let primaryPointerId = null;
let pathPointsX = [];
let pathPointsY = [];
let pathPointsRadius = [];
let penX = 0;
let penY = 0;
let penTargetIndex = 0;
let activeTouchCount = 0;

// Funtions
function saveUndo() {
    if (
        undoStack.push(
            context.getImageData(0, 0, width, height)
        ) > UNDO_MAX_STEPS + 1
    ) {
        undoStack.shift();
    }
    redoStack.length = 0;
}

function pointerupHandler(e) {
    if (painting && e.pointerId == primaryPointerId) { // End of stroke
        painting = false;
        penOnly = false;
        primaryPointerId = null;
        saveUndo();
    }
}

function pointermoveHandler(e) {
    e.preventDefault();
    let penDown = e.pressure > 0;
    let isPen = e.pointerType == 'pen';
    let isMNouse = e.pointerType == 'mouse';
    let penRadius = inputPenSize.value * e.pressure;
    if (isMNouse) {
        penRadius *= 2;
    }
    const rect = canvas.getBoundingClientRect();
    if (penOnly && !isPen) return; // Ignore unrelated touch events (such as palm).
    if (!e.isPrimary) return; // Ignore secondary touches
    if (painting && !penDown) { // End of stroke
        painting = false;
        penOnly = false;
        saveUndo();
    }
    else if (
        !painting &&
        penDown &&
        pointerOnCanvas &&
        activeTouchCount <= 1
    ) { // Start of stroke
        if (isPen) {
            penOnly = true;
        }
        primaryPointerId = e.pointerId;
        refBuffer = context.getImageData(0, 0, width, height);
        painting = true;
        pathPointsX.length = 0;
        pathPointsY.length = 0;
        pathPointsRadius.length = 0;
        pathPointsX[0] = e.clientX - rect.x;
        pathPointsY[0] = e.clientY - rect.y;
        pathPointsRadius[0] = penRadius;
        context.lineCap = "round";
        context.lineJoin= "round";
        context.strokeStyle = penColor;
        context.fillStyle = penColor;
        context.globalAlpha = inputAlpha.value / 100;
        penX = pathPointsX[0];
        penY = pathPointsY[0];
        penTargetIndex = 0;
    }
    if (painting) {
        pathPointsX.push(e.clientX - rect.x);
        pathPointsY.push(e.clientY - rect.y);
        pathPointsRadius.push(penRadius);
        const pointCount = pathPointsX.length;
        const smoothingDistance = inputPathSmoothing.value || 1;

        while (penTargetIndex < pointCount) {
            let targetX = pathPointsX[penTargetIndex];
            let targetY = pathPointsY[penTargetIndex];
            let radius = pathPointsRadius[penTargetIndex];
            let dirX = targetX - penX;
            let dirY = targetY - penY;
            let length = Math.sqrt(dirX * dirX + dirY * dirY);

            if (length < smoothingDistance) {
                penTargetIndex++;
            }
            context.beginPath();
            context.arc(penX, penY, radius/2, 0, 2 * Math.PI);
            context.stroke();
            context.fill();

            if (length > 0.01) {
                penX = penX + dirX / length;
                penY = penY + dirY / length;
            }
        }
    }
}
function clearCanvas() {
    context.reset();
    width = inputWidth.value;
    height = inputHeight.value;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width;
    canvas.style.height = height;
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.save();
    undoStack = [];
    saveUndo();
    document.body.style.paddingBottom = 100;
}
function undo() {
    if (undoStack.length > 1) {
        redoStack.push(undoStack.pop());
        context.putImageData(undoStack[undoStack.length - 1], 0, 0);
    }
}
function redo() {
    if (redoStack.length > 0) {
        undoStack.push(redoStack.pop());
        context.putImageData(undoStack[undoStack.length - 1], 0, 0);
    }
}
function keyDownHandler(e) {
    if (e.ctrlKey && e.key.toLowerCase() == 'z') {
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }

    }
    if (e.ctrlKey && e.key.toLowerCase() == 'y') {
        redo();
    }
}
function loadImageFromURL(url) {
    let image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = function () {
        inputWidth.value = image.width;
        inputHeight.value = image.height;
        clearCanvas();
        context.drawImage(image, 0, 0);
        saveUndo();
        undoStack.shift();
        console.log("Image loaded successfully!");
    };

    image.src = url;
    console.log("Reading image from: " + url);
}
function showContextMenu(x, y, options) {
    let rootMenu = document.createElement("div");
    rootMenu.classList.add("context-menu-root");
    rootMenu.closedBy = "any";

    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const button = document.createElement("button");
        button.classList.add("context-menu-item");
        button.innerText = option.text || "(undefined)";

        rootMenu.appendChild(button);
    }

    rootMenu.style.left = x + "px";
    rootMenu.style.top = y + "px";

    document.body.appendChild(rootMenu);

    contextMenus.push(rootMenu);
}
function closeContextMenu() {
    while (contextMenus.length > 0) {
        const menu = contextMenus.pop();
        document.body.removeChild(menu);
    }
    contextMenuSubject = "";
}
function onTabButtonSelected(innerText, x, y) {
    const nextSubject = (contextMenuSubject != innerText) ? innerText : "";
    if (contextMenus.length > 0) {
        closeContextMenu();
    }
    if (nextSubject == "") return;
    if (innerText == "File") {
        showContextMenu(
            x, y,
            [
                {text: "New"},
                {text: "Open"},
                {text: "Save as"}
            ]
        );
        contextMenuSubject = innerText;
    }
}

// Add event listeners
canvas.addEventListener("pointerenter", () => {
    pointerOnCanvas = true;
});
canvas.addEventListener("pointerleave", () => {
    pointerOnCanvas = false;
});
document.body.addEventListener("pointermove", pointermoveHandler, { passive: false });
document.body.addEventListener("pointerup", pointerupHandler);
document.body.addEventListener("pointercancel", pointerupHandler);
window.addEventListener('keydown', keyDownHandler);

clearButton.addEventListener("click", () => {
    if (window.confirm("Are you sure that you want to clear the canvas? This can't be undone.")) {
        clearCanvas();
    }
});
undoButton.addEventListener("click", undo);
downloadButton.addEventListener("click", (e) => {
    let url = canvas.toDataURL("image/png");
    let a = document.createElement("a");
    a.href = url;
    a.download = "drawing.png";
    a.type = "image/png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});
inputPenColor.addEventListener("input", (e) => {
    penColor = e.target.value;
});
document.querySelectorAll(".tab-button").forEach((elem) => {
    elem.addEventListener("click", (e) => {
        const rect = elem.getBoundingClientRect();
        onTabButtonSelected(elem.innerText, rect.left, rect.bottom);
    });
})

canvas.addEventListener('touchstart', function(e) {
    activeTouchCount = e.targetTouches.length;
    if (activeTouchCount == 2) {
        undo();
    }
    if (activeTouchCount == 3) {
        redo(redo()); // i'm not sure why but I don't care :)
    }
});


// Initialize stuff
canvas.style.touchAction = 'none';
inputPenSize.value = 5;
inputPenColor.value = penColor;
inputAlpha.value = 100;
inputWidth.value = width;
inputHeight.value = height;
clearCanvas();
if (baseImageURL && baseImageURL.length > 0) { // Load a base image if provided in the URL
    loadImageFromURL(baseImageURL);
}
