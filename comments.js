
const commentsSection = document.getElementById("comments-section");
const sendButton = document.getElementById("btn-send");
const privateCheckbox = document.getElementById("comment-private");
const inputBox = document.getElementById("comment-input");

const history = new Array();
const client = new Peer();

let dataConnection = null;

client.on('open', (id) => {
	console.log(`connected to the peerserver. id: ${id}`);

	sendButton.textContent = "Connecting...";

	dataConnection = client.connect("kutayx7-comments-1", {
		serialization: 'json',
		reliable: true
	});

	dataConnection.on('error', (err) => {
		console.log(err);
		sendButton.textContent = "error";
		sendButton.disabled =  true;
	});

	dataConnection.on('open', () => {
		console.log("connected to the comment server");

		sendButton.textContent = "Send Comment";
		sendButton.disabled =  false;

		dataConnection.send({command: 'LOAD'});
	});

	dataConnection.on('close', () => {
		console.log("disconnected from the comment server");

		sendButton.textContent = "Connection lost.";
		sendButton.disabled =  true;
	});

	dataConnection.on("data", (data) => {
		console.log(data);
		if (data.type == "comments") {
			history.length = 0;
			commentsSection.innerHTML = "";
			for (const message of data.messages) {
				history.push(message);
				const p = document.createElement("p");
				p.style.marginBottom = "2px";
				p.style.marginTop = "2px";
				p.textContent = message.text;
				commentsSection.after(p);
			}
		}
		if (data.type == "new_comment") {
			history.push(data.message);
			const p = document.createElement("p");
			p.style.marginBottom = "2px";
			p.style.marginTop = "2px";
			p.textContent = data.message.text;
			commentsSection.after(p);
		}
	});
});

client.on('close', () => {
	console.log("disconnected from the peerserver");
	dataConnection = null;
});

client.on('error', (err) => {
	console.log(err);
	sendButton.textContent = "Connection failed.";
	sendButton.disabled = true;
});

sendButton.addEventListener("click", () => {
	if (dataConnection) {
		dataConnection.send({
			command: "SEND",
			text: inputBox.value,
			is_private: privateCheckbox.checked
		});
		inputBox.value = "";
	}
})
