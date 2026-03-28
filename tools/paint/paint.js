
// Constants
const UNDO_MAX_STEPS = 256; // Good enough for almost all cases without sacrificing too much memory

const canvas = document.getElementById("main-canvas");
const context = canvas.getContext("2d");
const clearButton = document.getElementById("button-clear-canvas");
const undoButton = document.getElementById("button-undo");
const downloadButton = document.getElementById("button-download-image");
const inputPenColor = document.getElementById("input-pen-color");
const inputAlpha = document.getElementById("input-pen-alpha");
const inputPenSize = document.getElementById("input-pen-size");
const inputWidth = document.getElementById("input-width");
const inputHeight = document.getElementById("input-height");
const searchParams = new URLSearchParams(document.location.search);
const baseImageURL = searchParams.get("src");
const contextMenus = [];


// Variables
let width = 1280;
let height = 720;
let painting = false;
let undoStack = [];
let penColor = "#000000";
let refBuffer = null;
let contextMenuSubject = "";


// Funtions
function rotate90(x, y) {
    return [-y, x];
}
function saveUndo() {
    if (undoStack.push(context.getImageData(0, 0, width, height)) > (UNDO_MAX_STEPS + 1)) {
        undoStack.shift();
    }
}
function mouseMoveHandler(e) {

    let mouseDown = e.buttons & 1;

    if (painting && !mouseDown) { // End of stroke
        painting = false;
        saveUndo();
    }
    else if (!painting && mouseDown) { // Start of stroke
        refBuffer = context.getImageData(0, 0, width, height);
        painting = true;
        context.lineWidth = inputPenSize.value || 1;
        context.lineCap = "round";
        context.lineJoin= "round";
        context.strokeStyle = penColor;
        context.globalAlpha = inputAlpha.value / 100;
        context.beginPath();
        context.moveTo(e.offsetX - e.movementX, e.offsetY - e.movementY);
    }

    if (painting) {
        context.putImageData(refBuffer, 0, 0);
        context.lineTo(e.offsetX, e.offsetY);
        context.stroke();
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
}
function undo() {
    if (undoStack.length > 1) {
        undoStack.pop();
        context.putImageData(undoStack[undoStack.length - 1], 0, 0);
    }
}
function keyDownHandler(e) {
    if (e.ctrlKey && e.keyCode == 90) {
        undo();
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
canvas.addEventListener("mousemove", mouseMoveHandler);
clearButton.addEventListener("click", clearCanvas);
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
window.addEventListener('keydown', keyDownHandler);
document.querySelectorAll(".tab-button").forEach((elem) => {
    elem.addEventListener("click", (e) => {
        const rect = elem.getBoundingClientRect();
        onTabButtonSelected(elem.innerText, rect.left, rect.bottom);
    });
})


// Initialize stuff
inputPenSize.value = 5;
inputPenColor.value = penColor;
inputAlpha.value = 100;
inputWidth.value = width;
inputHeight.value = height;
clearCanvas();
if (baseImageURL && baseImageURL.length > 0) { // Load a base image if provided in the URL
    loadImageFromURL(baseImageURL);
}
