
const commentsSection = document.getElementById("comments-section");
const sendButton = document.getElementById("btn-send");
const privateCheckbox = document.getElementById("comment-private");
const urlInput = document.getElementById("comment-embed-url");
const inputBox = document.getElementById("comment-input");

const history = new Array();
const client = new Peer();

let dataConnection = null;
let retry_time_seconds = 5;

// This is for comment server verification.
let publicKey = null;
window.crypto.subtle.importKey(
	'jwk',
	{
		"key_ops": [
			"verify"
		],
		"ext": true,
		"alg": "PS256",
		"kty": "RSA",
		"n": "iyt1tFKxHtjcs9zDwHu-OmMCKgjCa0De-k4kaj1iAsFfxjda1ExRvjiCxqu5HYCq4JcMbJBzqTlVvtpSYe5IULRu9_oBRF9cKa666uV5kW9IZz3GuOo1a9EIygl_XGIu35j3PaTBhkJRRx7Y7RZOhLE9iz0eLOSS_w4TDZjH2NPoFkGQqoFCaFd136AHccSWIDD-m9xmHD0QGqCgiiHyCfhE6IU3eo1Vqt125_ZV0BRarTCPKXeknuJYNdWqVzrMV5MTpOqDyqDepCpoD2hASh1qvleESAiHnoa2oewWZPY3VtyXXiNfU93zAa1Llb2oL161w3oxmHi2JDEhWJqjIQ",
		"e": "AQAB"
	},
	{
		name: 'RSA-PSS',
		hash: {
			name: 'SHA-256'
		}
	},
	true,
	['verify']
).then((key) => {
	publicKey = key;
});

function display_comment(comment, style) {
	const p = document.createElement("p");
	p.style.marginBottom = "2px";
	p.style.marginTop = "2px";
	p.textContent = comment.text;
	if (style) {
		for (const [key, value] of Object.entries(style)) {
			p.style[key] = value;
		}
	}
	let embed_url = comment.embed_url;
	if (embed_url) {
		const img = document.createElement("img");
		img.crossOrigin = 'anonymous';
		img.loading = 'lazy';
		img.src = embed_url;
		img.height = 120;
		p.append(document.createElement("br"));
		p.append(img);
	}
	commentsSection.prepend(p);
}

function connect_to_comment_server() {
	if (dataConnection && dataConnection.open) return;

	sendButton.textContent = "Connecting...";
	sendButton.disabled =  true;

	dataConnection = client.connect("kutayx7-comments-1", {
		serialization: 'json',
		reliable: true
	});
	dataConnection.server_verified = false;

	dataConnection.on('open', () => {
		console.log("connected to the comment server");
		sendButton.textContent = "Verifying...";
		sendButton.disabled =  true;
		retry_time_seconds = 5;

		setTimeout(() => {
			if (sendButton.textContent == "Verifying...") {
				console.log("verification took too long.");
				sendButton.textContent = "Verification timeout. The server might've been compromised. Please try again later.";
				sendButton.disabled =  true;
			}
		}, 3500);
	});

	dataConnection.on('error', (err) => {
		console.log(`DataConnection error: ${err.type} ${err}`);
		sendButton.disabled =  true;
	});

	dataConnection.on('close', () => {
		console.log("disconnected from the comment server");
		sendButton.textContent = `Connection lost. Retrying in ${retry_time_seconds} seconds...`;
		sendButton.disabled =  true;
		reconnect_later(retry_time_seconds);
	});

	dataConnection.on("data", (data) => {
		if (!dataConnection.server_verified) {
			if (data.type == "verification") {
				console.log("verification data received");
				const signature_binary_string = atob(data.signature);
				const signature_length = signature_binary_string.length;
				const signature_bytes = new Uint8Array(signature_length);
				for (let i = 0; i < signature_length; i++) {
					signature_bytes[i] = signature_binary_string.charCodeAt(i);
				}

				const encoder = new TextEncoder();
				const encoded_id = encoder.encode(client.id+"+").buffer;
				crypto.subtle.verify(
					{
						name: 'RSA-PSS',
						saltLength: 32
					},
					publicKey,
					signature_bytes.buffer,
					encoded_id
				).then((verified) => {
					if (verified) {
						console.log("the comment server PASSED the verification");
						dataConnection.send({command: 'LOAD'});
						sendButton.textContent = "Send Comment";
						sendButton.disabled =  false;
						dataConnection.server_verified = true;
					} else {
						console.log("the comment server FAILED the verification");
						sendButton.textContent = "Verification failed. Server seems to have been compromised. Please check again later.";
						sendButton.disabled =  true;
					}
				}).catch((err) => {
					console.log(err);
					sendButton.textContent = "Verification failed. The server might have been compromised. Please try again later.";
					sendButton.disabled =  true;
				});
				client.disconnect();
			}
			return;
		}
		if (data.type == "comments") {
			history.length = 0;
			commentsSection.replaceChildren();
			for (const message of data.messages) {
				history.push(message);
				display_comment(message, null);
			}
		}
		if (data.type == "new_comment") {
			history.push(data.message);
			display_comment(data.message, data.style);
		}
	});
}

function reconnect_later(seconds) {
	seconds = Math.max(seconds, 5);
	setTimeout(() => {
		if (client.disconnected) {
			client.reconnect();
			reconnect_later(5);
		}
		else {
			if ((!dataConnection) || !(dataConnection.open)) {
				connect_to_comment_server();
			}
		}
	}, seconds * 1000);
}

client.on('open', (id) => {
	console.log(`connected to the peerserver. id: ${id}`);
	connect_to_comment_server();
});

client.on('close', () => {
	console.log("Peer (client) object has been destroyed.");
});

client.on('disconnected', () => {
	console.log("disconnected from the peerserver");
});

client.on('error', (err) => {
	console.log(`Peer error: ${err.type} ${err}`);
	sendButton.disabled = true;
	sendButton.textContent = "";

	switch (err.type) {
		case 'browser-incompatible':
			sendButton.textContent = "Incompatible browser."; break;
		case 'disconnected': // You've already disconnected this peer from the server and can no longer make any new connections on it.
			sendButton.textContent = "Please let KutayX7 know if you ever see this."; break;
		case 'peer-unavailable': // The peer you're trying to connect to does not exist.
			reconnect_later(retry_time_seconds);
			retry_time_seconds *= 2;
			sendButton.textContent = `Service unavailable. Please check here again later. Retrying in ${retry_time_seconds} seconds...`;
			break;
		case 'ssl-unavailable': // (fatal) PeerJS is being used securely, but the cloud server does not support SSL. Use a custom PeerServer.
			sendButton.textContent = "SSL error. Please try again later."; break;
		case 'network': // Lost or cannot establish a connection to the signalling server.
			reconnect_later(retry_time_seconds);
			retry_time_seconds *= 2;
			sendButton.textContent = `Network error. Retrying in ${retry_time_seconds} seconds...`;
			break;
		case 'server-error': // (fatal) Unable to reach the server.
			sendButton.textContent = "Can't connect. Please try again later."; break;
		case 'socket-error': // (fatal) An error from the underlying socket.
		case 'socket-closed': // (fatal) The underlying socket closed unexpectedly.
			sendButton.textContent = "Socket error. Please Refresh the page."; break;
		default:
			sendButton.textContent = "Some unexpected error. Please refresh the page.";
	}
});

function check_url_validity(url_string) {
	try {
		const url = new URL(urlInput.value);
		if (url.protocol === 'https:' && url.href.length < 256) {
			return true;
		}
	} catch (err) {};
	return false;
}

urlInput.addEventListener('input', () => {
	if (!urlInput.value) {
		urlInput.style.outline = "1px solid gray";
	} else if (check_url_validity(urlInput.value)) {
		urlInput.style.outline = "1px solid green";
	} else {
		urlInput.style.outline = "1px solid red";
	}
});

sendButton.addEventListener("click", () => {
	if (dataConnection && dataConnection.open) {
		let url = check_url_validity(urlInput.value) ? new URL(urlInput.value) : null;

		dataConnection.send({
			command: "SEND",
			text: inputBox.value,
			is_private: privateCheckbox.checked,
			embed_URL: url.href,
		});
		sendButton.textContent =  "...";
		sendButton.disabled =  true;

		setTimeout(() => {
			if (sendButton.textContent == "...") {
				sendButton.textContent =  "Send Comment";
				sendButton.disabled =  false;
			}
		}, 5000);
	}
})
