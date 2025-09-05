const { BoundCluster } = require("zigbee-clusters");

class OnOffBoundCluster extends BoundCluster {
  constructor({ onSetOn, onSetOff }) {
    super();
    // this._onOn = onOn;
    // this._onOff = onOff;
    this._onSetOn = onSetOn;
    this._onSetOff = onSetOff;
  }

  // on() {
  //   this._onOn();
  // }

  // off() {
  //   this._onOff();
  // }

  setOn() {
    if (this._onSetOn) {
      this._onSetOn();
    }
  }

  setOff() {
    if (this._onSetOff) {
      this._onSetOff();
    }
  }
}

module.exports = OnOffBoundCluster;
