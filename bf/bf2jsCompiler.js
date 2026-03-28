
/*
 * This function compiles valid Brainfuck code into valid JavaScript code.
 * Source code MUST be sanitized and validated beforehand.
 * TODO: Add range prediction optimizations.
 */
function compile(source) {
    let output = "let c=0;let m=new Uint8Array(30000);let p=0;";

    for (const codepoint of source) {
        switch(codepoint) {
            case "+":
                output += "m[p]++;"; break;
            case "-":
                output += "m[p]--;"; break;
            case ">":
                output += "p=(p+1)%30000;"; break;
            case "<":
                output += "p=(p+29999)%30000;"; break;
            case "]":
                output += "};"; break;
            case "[":
                output += "while(m[p]){"; break;
            case ".":
                output += "o(m[p]);"; break;
            case ",":
                output += "m[p]=i.at(c++)||0;"; break;
        }
    }

    return output;
}
