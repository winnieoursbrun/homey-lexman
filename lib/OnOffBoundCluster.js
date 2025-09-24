const { BoundCluster } = require("zigbee-clusters");

class OnOffBoundCluster extends BoundCluster {
  
  constructor({ onSetOn, onSetOff, onToggle }) {
    super();
    
    // Validate handlers
    if (typeof onSetOn !== 'function') {
      throw new Error('onSetOn handler must be a function');
    }
    if (typeof onSetOff !== 'function') {
      throw new Error('onSetOff handler must be a function');
    }

    this._onSetOn = onSetOn;
    this._onSetOff = onSetOff;
    this._onToggle = onToggle;
    
    // Track command history for debugging
    this._commandHistory = [];
    this._maxHistorySize = 50;
  }

  /**
   * Handle setOn command
   */
  setOn() {
    try {
      this._recordCommand('setOn');
      
      if (this._onSetOn) {
        this._onSetOn();
      } else {
        console.warn('OnOffBoundCluster: setOn handler not available');
      }
    } catch (error) {
      console.error('OnOffBoundCluster: Error in setOn handler:', error);
    }
  }

  /**
   * Handle setOff command
   */
  setOff() {
    try {
      this._recordCommand('setOff');
      
      if (this._onSetOff) {
        this._onSetOff();
      } else {
        console.warn('OnOffBoundCluster: setOff handler not available');
      }
    } catch (error) {
      console.error('OnOffBoundCluster: Error in setOff handler:', error);
    }
  }

  /**
   * Handle toggle command (if supported)
   */
  toggle() {
    try {
      this._recordCommand('toggle');
      
      if (this._onToggle) {
        this._onToggle();
      } else {
        console.warn('OnOffBoundCluster: toggle handler not available');
      }
    } catch (error) {
      console.error('OnOffBoundCluster: Error in toggle handler:', error);
    }
  }

  /**
   * Record command in history for debugging
   */
  _recordCommand(command) {
    const record = {
      command,
      timestamp: new Date(),
      id: Math.random().toString(36).substring(2, 11)
    };

    this._commandHistory.push(record);

    // Keep history size manageable
    if (this._commandHistory.length > this._maxHistorySize) {
      this._commandHistory.shift();
    }
  }

  /**
   * Get command history for debugging
   */
  getCommandHistory() {
    return [...this._commandHistory];
  }

  /**
   * Clear command history
   */
  clearCommandHistory() {
    this._commandHistory = [];
  }

  /**
   * Get cluster statistics
   */
  getStats() {
    const totalCommands = this._commandHistory.length;
    const commandCounts = this._commandHistory.reduce((counts, record) => {
      counts[record.command] = (counts[record.command] || 0) + 1;
      return counts;
    }, {});

    return {
      totalCommands,
      commandCounts,
      lastCommand: this._commandHistory[this._commandHistory.length - 1] || null
    };
  }
}

module.exports = OnOffBoundCluster;
