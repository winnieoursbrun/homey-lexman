const { BoundCluster } = require("zigbee-clusters");

class AdeoBoundCluster extends BoundCluster {
  constructor({ onSceneButton }) {
    super();
    this._onSceneButton = onSceneButton;
  }

  // Handle manufacturer-specific button events
  buttonEvent(payload) {
    const { buttonId, action } = payload;
    
    if (this._onSceneButton) {
      this._onSceneButton({ buttonId, action });
    }
  }

  // Handle raw frames for manufacturer-specific commands
  async handleFrame(frame, meta) {
    if (frame.cmdId === 0 && frame.data && frame.data.length >= 2) {
      const buttonId = frame.data[0];
      const action = frame.data[1];
      
      if (this._onSceneButton) {
        this._onSceneButton({ buttonId, action });
      }
    }
  }
}

module.exports = AdeoBoundCluster;
