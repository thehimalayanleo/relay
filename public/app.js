const port = document.querySelector("relay-button");

port.addEventListener("relay-created", (event) => {
  document.querySelector(".run-state").innerHTML = `<span></span> HANDOFF READY · ${event.detail.digest.slice(0, 8)}`;
});

port.addEventListener("relay-error", (event) => {
  console.error("Relay:", event.detail.message);
});
