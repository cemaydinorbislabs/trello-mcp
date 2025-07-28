// Tools module exports
export { BaseTool, type ToolResult, type ToolExecutionContext } from './base-tool.js';
export { boardTools } from './board-tools.js';
export { listTools } from './list-tools.js';
export { cardTools } from './card-tools.js';
export { optimizedCardTools } from './card-tools-optimized.js';
export { bulkTools } from './bulk-tools.js';

// Collect all tools
import { boardTools } from './board-tools.js';
import { listTools } from './list-tools.js';
import { cardTools } from './card-tools.js';
import { optimizedCardTools } from './card-tools-optimized.js';
import { bulkTools } from './bulk-tools.js';

export const allTools = [
  ...boardTools,
  ...listTools,
  ...cardTools,
  ...optimizedCardTools,
  ...bulkTools,
];

// Export grouped tools for convenience
export const toolGroups = {
  board: boardTools,
  list: listTools,
  // card: cardTools,
  optimizedCard: optimizedCardTools,
  bulk: bulkTools,
};

// Tool registry for easy lookup
export const toolRegistry = new Map();
allTools.forEach(tool => {
  toolRegistry.set(tool.name, tool);
});

// Helper functions
export function getToolByName(name: string) {
  return toolRegistry.get(name);
}

export function getToolDefinitions() {
  return allTools.map(tool => tool.getDefinition());
}

export function getToolsByCategory(category: keyof typeof toolGroups) {
  return toolGroups[category] || [];
}

export default {
  allTools,
  toolGroups,
  toolRegistry,
  getToolByName,
  getToolDefinitions,
  getToolsByCategory,
};
