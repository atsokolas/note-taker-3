const liveServer = require("live-server");
const open = require("open");

// Configure Live Server
const params = {
    port: 5500,
    host: "127.0.0.1",
    root: "./", // Project root directory
    file: "index.html", // Default file if none specified
    wait: 100, // Wait time after changes
    logLevel: 2,
};

function startServerAndOpenFile(filePath) {
    liveServer.start(params); // Start Live Server

    // Open the saved file in the browser
    open(`http://127.0.0.1:5500/${filePath}`);
}

// Path to the newly saved article
const filePath = process.argv[2]; // Pass file path as an argument
startServerAndOpenFile(filePath);
