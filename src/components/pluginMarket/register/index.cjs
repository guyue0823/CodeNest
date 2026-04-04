const { pluginRegistry } = require('./pluginRegistry.cjs');
const { pluginHost } = require('./pluginHost.cjs');
const { setupPluginIPC } = require('./pluginIPC.cjs');

module.exports = {
  pluginRegistry,
  pluginHost,
  setupPluginIPC
};
