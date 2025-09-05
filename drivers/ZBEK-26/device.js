const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER } = require('zigbee-clusters');
const OnOffBoundCluster = require('../../lib/OnOffBoundCluster');
const LevelControlBoundCluster = require('../../lib/LevelControlBoundCluster');
const ScenesBoundCluster = require('../../lib/ScenesBoundCluster');
const ColorControlBoundCluster = require('../../lib/ColorControlBoundCluster');
const AdeoBoundCluster = require('../../lib/AdeoBoundCluster');
const AdeoCluster = require('../../lib/AdeoCluster');

class AdeoRemote extends ZigBeeDevice {
  async onNodeInit({ zclNode }) {

    // Enable debug logging during development
    debug(true);

    // Make sure to call the parent class's onNodeInit
    await super.onNodeInit({ zclNode });

    const endpoint = zclNode.endpoints[1]; // adjust endpoint as needed

    // Get the raw ZigBee node for handling manufacturer-specific frames
    const node = await this.homey.zigbee.getNode(this);

    // Override handleFrame to catch manufacturer-specific frames
    const originalHandleFrame = node.handleFrame;
    node.handleFrame = (endpointId, clusterId, frame, meta) => {
      // Handle manufacturer-specific cluster (65024)
      if (endpointId === 1 && clusterId === 65024) {
        this.log('Received manufacturer frame:', {
          endpointId,
          clusterId,
          frame: frame.toString('hex'),
          meta
        });
        
        // Parse the frame data - button ID is at position 5
        if (frame.length >= 6) {
          const buttonId = frame[5];
          const action = frame.length > 6 ? frame[6] : frame[1];
          
          // Map button IDs to scene numbers - updated mapping based on actual data
          const sceneMap = { 0x0a: 1, 0x0b: 2, 0x0c: 3, 0x0d: 4 };
          const sceneId = sceneMap[buttonId];
          
          if (sceneId) {
            const triggerAction = `pressed_scene_${sceneId}`;
            this.log(`Remote action: manufacturer scene ${sceneId} (button 0x${buttonId.toString(16)})`);
            this.homey.flow.getDeviceTriggerCard(triggerAction).trigger(this);
          }
        }
        return; // Don't call original handler for this cluster
      }
      
      // Handle Color Control cluster (768) for up/down buttons
      if (endpointId === 1 && clusterId === 768) {
        this.log('Received Color Control frame:', {
          endpointId,
          clusterId,
          cmdId: frame.cmdId,
          data: frame.data ? frame.data.toString('hex') : 'no data',
          meta
        });
        
        // Parse different command types
        if (frame.data && frame.data.length >= 1) {
          const direction = frame.data[0];
          let action = null;
          
          switch (frame.cmdId) {
            case 76: // Original up/down buttons
              const isUp76 = direction === 0x03;
              action = isUp76 ? 'pressed_brightness_up' : 'pressed_brightness_down';
              this.log(`Remote action: ${isUp76 ? 'brightness up' : 'brightness down'} (cmd76, direction: 0x${direction.toString(16)})`);
              break;
              
            case 5: // Additional up/down buttons
              const isUp5 = direction === 0x03;
              action = isUp5 ? 'pressed_brightness_up' : 'pressed_brightness_down';
              this.log(`Remote action: ${isUp5 ? 'brightness up' : 'brightness down'} (cmd5, direction: 0x${direction.toString(16)})`);
              break;
              
            case 2: // Left/right buttons
              const isRight = direction === 0x03;
              action = isRight ? 'pressed_color_right' : 'pressed_color_left';
              this.log(`Remote action: ${isRight ? 'color right' : 'color left'} (cmd2, direction: 0x${direction.toString(16)})`);
              break;
          }
          
          if (action) {
            this.homey.flow.getDeviceTriggerCard(action).trigger(this);
          }
        }
        return; // Don't call original handler for this frame
      }
      
      // Call original handler for other clusters
      if (originalHandleFrame) {
        originalHandleFrame.call(node, endpointId, clusterId, frame, meta);
      }
    };

    // Register OnOff bound cluster
    endpoint.bind(CLUSTER.ON_OFF.NAME, new OnOffBoundCluster({
      onSetOn: () => {
        this.log('Remote action: setOn');
        this.homey.flow.getDeviceTriggerCard('pressed_on').trigger(this);
      },
      onSetOff: () => {
        this.log('Remote action: setOff');
        this.homey.flow.getDeviceTriggerCard('pressed_off').trigger(this);
      }
    }));

    // Register LevelControl bound cluster - fix the logic
    endpoint.bind(CLUSTER.LEVEL_CONTROL.NAME, new LevelControlBoundCluster({
      onStep: (payload) => {
        this.log('Remote action: step', payload);
        const isUp = payload.stepMode === 0;
        const action = isUp ? 'pressed_brightness_up' : 'pressed_brightness_down';
        this.log(`Remote action: ${isUp ? 'brightness up' : 'brightness down'}`);
        this.homey.flow.getDeviceTriggerCard(action).trigger(this);
      }
    }));

    // Register Scenes bound cluster
    endpoint.bind(CLUSTER.SCENES.NAME, new ScenesBoundCluster({
      onRecallScene: (payload) => {
        const sceneId = payload.sceneId;
        const action = `pressed_scene_${sceneId}`;
        this.log(`Remote action: scene ${sceneId}`);
        this.homey.flow.getDeviceTriggerCard(action).trigger(this);
      }
    }));

    // Register Color Control bound cluster
    endpoint.bind(CLUSTER.COLOR_CONTROL.NAME, new ColorControlBoundCluster({
      onMoveToHue: (payload) => {
        this.log('Remote action: color control - move to hue', payload);
      },
      onMoveToSaturation: (payload) => {
        this.log('Remote action: color control - move to saturation', payload);
      }
    }));

    // Register manufacturer-specific cluster (65024) with proper cluster
    endpoint.bind(AdeoCluster.NAME, new AdeoBoundCluster({
      onSceneButton: (payload) => {
        const { buttonId, action } = payload;
        // Map button IDs to scene numbers (adjust mapping as needed)
        const sceneMap = { 0x0a: 1, 0x0b: 2, 0x0c: 3, 0x0d: 4 };
        const sceneId = sceneMap[buttonId];
        
        if (sceneId) {
          const triggerAction = `pressed_scene_${sceneId}`;
          this.log(`Remote action: manufacturer scene ${sceneId} (button 0x${buttonId.toString(16)})`);
          this.homey.flow.getDeviceTriggerCard(triggerAction).trigger(this);
        }
      }
    }));
  }
}

module.exports = AdeoRemote;
