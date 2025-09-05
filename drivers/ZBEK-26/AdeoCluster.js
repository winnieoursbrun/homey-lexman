// const { Cluster, ZCLDataTypes } = require('zigbee-clusters');

// class AdeoCluster extends Cluster {
//   static get ID() {
//     return 0xFE00; // manufacturer-specific cluster ID
//   }

//   static get NAME() {
//     return 'adeoRemote';
//   }

//   static get COMMANDS() {
//     return {
//       0x00: {
//         name: 'buttonEvent',
//         args: [
//           { name: 'data1', type: ZCLDataTypes.uint8 },
//           { name: 'data2', type: ZCLDataTypes.uint8 },
//         ],
//       },
//     };
//   }
// }

// module.exports = AdeoCluster;
