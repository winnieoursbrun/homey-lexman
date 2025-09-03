const { ZigBeeDevice } = require('homey-zigbeedriver');

class AdeoRemote extends ZigBeeDevice {
  async onNodeInit({ zclNode }) {
    const cluster = zclNode.endpoints[1]; // adjust endpoint as needed

    this.log('Adeo Remote (ZBEK-26) initialized');
    this.log('Device:', this.getData());
    this.log('Endpoints:', Object.keys(zclNode.endpoints));

    // Map actions to flow triggers

    const mapping = {
      'on': 'pressed_on',
      'off': 'pressed_off',
      'brightnessstepup': 'pressed_brightness_up',
      'brightnessstepdown': 'pressed_brightness_down',
      'up': 'pressed_up',
      'down': 'pressed_down',
      'left': 'pressed_left',
      'right': 'pressed_right',
      'center': 'pressed_center',
      'scene1': 'scene_1',
      'scene2': 'scene_2',
      'scene3': 'scene_3',
      'scene4': 'scene_4',
    };

    cluster.on('action', ({ action }) => {
      this.log(`Remote action detected: ${action}`);
      const triggerId = mapping[action];
      if (triggerId) {
        this.log(`Remote action detected: ${action}`);
        this.driver.triggerFlow({ id: triggerId, device: this });
      }
    });
  }
}

module.exports = AdeoRemote;
