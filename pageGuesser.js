
const suggestions = new Map();

suggestions.set("/not_found", "/404");
suggestions.set("/tools/apint", "/tools/paint/");
suggestions.set("/tools/piant", "/tools/paint/");
suggestions.set("/tools/plant", "/tools/paint/");
suggestions.set("/tools/bf", "/bf");
suggestions.set("/tools/brainfuck", "/bf");
suggestions.set("/paint", "/tools/paint/");
suggestions.set("/apint", "/tools/paint/");
suggestions.set("/piant", "/tools/paint/");
suggestions.set("/app/paint", "/tools/paint/");
suggestions.set("/apps/paint", "/tools/paint/");
suggestions.set("/draw", "/tools/paint/");
suggestions.set("/drawing", "/tools/paint/");
suggestions.set("/canvas", "/tools/paint/");
suggestions.set("/brainfuck", "/bf");
suggestions.set("/fuck", "/bf");

suggestions.set("/home", "/");
suggestions.set("/root", "/");
suggestions.set("/main", "/");

let pathname = document.location.pathname;
if (pathname.at(-1) == "/") pathname = pathname.slice(0, -1);

console.log(`Searching for "${pathname}" ...`)

const suggestion = suggestions.get(pathname);

if (suggestion) {
    const suggestedURL = "https://KutayX7.github.io" + suggestion;
    console.log(`Found a matching page: "${suggestedURL}"`);

    const p = document.querySelector("p");
    p.innerText = "The requested page could not be found, but there's a similar page, which might be the thing you're looking for.";

    const a = document.createElement("a");
    a.innerText = " -> Click here to check it out! <- ";
    a.href = suggestedURL;
    a.style.color = "LightGray";
    p.append(a);
}
else {
    console.log("No page suggestions.");
}
