const { BoundCluster } = require("zigbee-clusters");

class ColorControlBoundCluster extends BoundCluster {
  constructor({ onMoveToHue, onMoveToSaturation }) {
    super();
    this._onMoveToHue = onMoveToHue;
    this._onMoveToSaturation = onMoveToSaturation;
  }

  moveToHue(payload) {
    if (this._onMoveToHue) {
      this._onMoveToHue(payload);
    }
  }

  moveToSaturation(payload) {
    if (this._onMoveToSaturation) {
      this._onMoveToSaturation(payload);
    }
  }
}

module.exports = ColorControlBoundCluster;
