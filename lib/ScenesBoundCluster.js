const { BoundCluster } = require("zigbee-clusters");

class ScenesBoundCluster extends BoundCluster {
  constructor({ onRecallScene }) {
    super();
    this._onRecallScene = onRecallScene;
  }

  recallScene(payload) {
    this._onRecallScene(payload);
  }
}

module.exports = ScenesBoundCluster;
