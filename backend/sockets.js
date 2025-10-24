export default function setupSockets(io) {
  io.on("connection", socket => {
    socket.on("ping-incident", payload => {
      const { lat, lng, type, msg } = payload;
      if (!lat || !lng) return;
      io.emit("incident", {
        id: "rt-" + Date.now(),
        lat,
        lng,
        type: type || "unknown",
        msg: msg || "",
        ts: new Date().toISOString()
      });
    });
  });
}
