const port = document.querySelector("passon-button");

port.addEventListener("passon-created", (event) => {
  document.querySelector(".run-state").innerHTML = `<span></span> HANDOFF READY · ${event.detail.digest.slice(0, 8)}`;
});

port.addEventListener("passon-error", (event) => {
  console.error("PassOn:", event.detail.message);
});
