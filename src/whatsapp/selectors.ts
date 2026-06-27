export const selectors = {
  appReady: "#pane-side",
  searchBoxCandidates: [
    '#side input[role="textbox"][aria-label*="Search"]',
    'input[data-tab="3"][aria-label*="Search"]',
    '#side input[role="textbox"][data-tab="3"]',
    '#side input[role="textbox"]',
    '[data-testid="chat-list-search"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="Search"]',
    'div[contenteditable="true"][role="textbox"][title*="Search"]',
    '#side div[contenteditable="true"][role="textbox"]',
    '#side div[contenteditable="true"]',
    'div[contenteditable="true"][data-tab="3"]'
  ],
  chatRows: '#pane-side [role="listitem"], #pane-side [data-testid="cell-frame-container"]',
  chatTitle: "header span[title]",
  messagePane: "#main",
  messageRows: '#main div[data-id], #main [data-testid="msg-container"], #main .message-in, #main .message-out, #main [data-pre-plain-text]',
  messageText: '[data-testid="msg-text"], .selectable-text.copyable-text',
  messageMeta: "[data-pre-plain-text]",
  scrollContainer: '#main [data-testid="conversation-panel-messages"], #main .copyable-area'
} as const;
