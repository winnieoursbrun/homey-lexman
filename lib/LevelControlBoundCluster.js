const { BoundCluster } = require("zigbee-clusters");

class LevelControlBoundCluster extends BoundCluster {
  constructor({ onStep }) {
    super();
    this._onStep = onStep;
  }

  step(payload) {
    // Fix the step mode detection - 'up' means brightness up, 'down' means brightness down
    const correctedPayload = {
      ...payload,
      stepMode: payload.mode === 'up' ? 0 : 1
    };
    this._onStep(correctedPayload);
  }
}

module.exports = LevelControlBoundCluster;
