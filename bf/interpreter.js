const NUM_OF_CELLS = 3000; // standard number of cells for brainfuck
const MAX_CELL_VALUE = 255;

const MAX_VALUE_PLUS_1 = MAX_CELL_VALUE + 1;

const sourceCode = document.getElementById("source-code");
const input = document.getElementById("input");
const output = document.getElementById("output");
const runButton = document.getElementById("btn-run");
const clearButton = document.getElementById("btn-clear");

let memory = new Uint8Array(NUM_OF_CELLS);
let returnStack = [];
let inputArray = new Uint8Array();
let inputIndex = 0;

function validateBrainfuckCode(code) {
   let depth = 0;
   let index = 0;
   let row = 1;
   let column = 1;

   for (const codePoint of code) {
       if (codePoint == "[") depth++;
       if (codePoint == "]") depth--;
       if (depth < 0) return `Compilation error: Unmatching square brackets. There's an extra \`]\` at row:${row}, column:${column}`;
       index++;
       if (codePoint == "\n") {
           row++;
           column = 0;
        }
        column++;
    }

    if (depth) {
        // TODO: Add debug info about where the unclosed `[` is.
        return "Compilation error: Found unclosed square bracket(s).";
    }

    return 0;
}
function optimizeBrainfuckCode(code) {
    /*
        TODO: implement this

        This function should return a more optimized version of the provided brainfuck code.
    */

    return code;
}

function increment(index) {
    memory[index] = (memory[index] + 1) % MAX_VALUE_PLUS_1;
}
function decrement(index) {
    memory[index] = (memory[index] + MAX_VALUE_PLUS_1 - 1) % MAX_VALUE_PLUS_1;
}
function printChar(index) {
    /* TODO: Add basic terminal emulation */
    let out = output.value || "";
    out += String.fromCodePoint(memory[index]);
    output.value = out;
}
function printCodepoint(codepoint) {
    let out = output.value || "";
    out += String.fromCodePoint(codepoint);
    output.value = out;
}
function readChar(index) {
    let char = 0;
    if (inputIndex < inputArray.length) {
        char = inputArray[inputIndex++];
    }
    memory[index] = char;
}

function readInputs() {
    const inputText = input.value || "";
    const encoder = new TextEncoder();

    inputArray = encoder.encode(inputText);
    inputIndex = 0;
}


// TODO: Run code asyncly so it won't make the window unresponsive.

function run(code, input) {
    const invalid = validateBrainfuckCode(code);
    if (invalid) {
        output.value = invalid;
        return;
    }
    code = optimizeBrainfuckCode(code);

    readInputs();
    output.value = "";

    if (compile) {
        try {
            const compiledCode = compile(code);
            const f = Function("i", "o", compiledCode);
            f(inputArray, printCodepoint);
            return;
        }
        catch (e) {
            console.log(`Compilation into JS failed. Error: ${e}`);
        }
    }

    returnStack = [0];
    pointerIndex = 0;

    for (let i = 0; i < memory.length; i++) {
        memory[i] = 0;
    }

    while (true) {
        const index = returnStack.pop();
        if (index >= code.length) break;

        const command = code[index];

        switch (command) {
            case "+":
                increment(pointerIndex);
                returnStack.push(index + 1);
                break;
            case "-":
                decrement(pointerIndex);
                returnStack.push(index + 1);
                break;
            case ">":
                pointerIndex = (pointerIndex + 1) % NUM_OF_CELLS;
                returnStack.push(index + 1);
                break;
            case "<":
                pointerIndex = (pointerIndex + NUM_OF_CELLS - 1) % NUM_OF_CELLS;
                returnStack.push(index + 1);
                break;
            case "[":
                if (memory[pointerIndex]) { // value > 0, should enter loop
                    returnStack.push(index);
                    returnStack.push(index + 1);
                }
                else { // jump to the right of the matching square bracket
                    let depth = 0;
                    let targetIndex = index + 1;
                    while (true) {
                        if (code[targetIndex] == "]") {
                            if (depth == 0) break;
                            depth--;
                        }
                        else if (code[targetIndex] == "[") {
                            depth++;
                        }
                        targetIndex++;
                    }
                    returnStack.push(targetIndex + 1);
                }
                break;
            case "]":
                returnStack.push(returnStack.pop()); break;
            case ".":
                printChar(pointerIndex);
                returnStack.push(index + 1);
                break;
            case ",":
                readChar(pointerIndex);
                returnStack.push(index + 1);
                break;
            default:
                returnStack.push(index + 1);
        }
    }
}

runButton.addEventListener("click", (e) => {
    run(
        sourceCode.value,
        input.value
    )
})

output.value = "";
