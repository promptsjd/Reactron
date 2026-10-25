/**
 * Reactron Trigger Plugin Registry
 */
export const TriggerPluginRegistry = {
  plugins: new Map(),

  register(id, plugin) {
    this.plugins.set(id, plugin);
  },

  get(id) {
    return this.plugins.get(id);
  },

  getOrDefault(id, defaultId) {
    return this.plugins.get(id) || this.plugins.get(defaultId) || {
      autoResetOnClear: true,
      evaluate(root, config, context) {
        return { matched: false, similarityPct: 0 };
      }
    };
  }
};

// Register default visual-box plugin
TriggerPluginRegistry.register('visual-box', {
  autoResetOnClear: true,
  evaluate(rootElement, config, context) {
    return { matched: false, similarityPct: 0 };
  }
});
