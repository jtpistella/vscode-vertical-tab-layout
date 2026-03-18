import * as vscode from 'vscode';
import * as path from 'path';

class TabItem extends vscode.TreeItem {
    constructor(
        public readonly tab: vscode.Tab,
        public readonly uri: vscode.Uri | undefined,
        public readonly groupIndex: number
    ) {
        super(tab.label, vscode.TreeItemCollapsibleState.None);

        if (uri) {
            this.resourceUri = uri;
            this.tooltip = uri.fsPath;
            this.command = {
                command: 'tabsOnLeft.openTab',
                title: 'Open Tab',
                arguments: [uri, tab]
            };
        }

        // Description: active dot indicator
        if (tab.isActive) this.description = '●';

        // Show a dirty indicator for unsaved files
        if (tab.isDirty) {
            this.label = `${tab.label} ○`;
        }

        // Always show the pinned icon for pinned tabs (overrides file icon)
        if (tab.isPinned) {
            this.iconPath = new vscode.ThemeIcon('pinned');
        }

        this.contextValue = tab.isPinned ? 'tabItemPinned' : 'tabItem';
    }
}

class TabsProvider implements vscode.TreeDataProvider<TabItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TabItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TabItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TabItem): TabItem[] {
        if (element) {
            return [];
        }

        const items: TabItem[] = [];

        for (let g = 0; g < vscode.window.tabGroups.all.length; g++) {
            const group = vscode.window.tabGroups.all[g];
            for (const tab of group.tabs) {
                let uri: vscode.Uri | undefined;

                if (tab.input instanceof vscode.TabInputText) {
                    uri = tab.input.uri;
                } else if (tab.input instanceof vscode.TabInputNotebook) {
                    uri = tab.input.uri;
                } else if (tab.input instanceof vscode.TabInputTextDiff) {
                    uri = tab.input.modified;
                } else if (tab.input instanceof vscode.TabInputCustom) {
                    uri = tab.input.uri;
                }

                items.push(new TabItem(tab, uri, g));
            }
        }

        // Pinned tabs first, then alphabetical
        items.sort((a, b) => {
            if (a.tab.isPinned !== b.tab.isPinned) {
                return a.tab.isPinned ? -1 : 1;
            }
            return a.tab.label.localeCompare(b.tab.label, undefined, { sensitivity: 'base' });
        });

        return items;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const provider = new TabsProvider();

    const treeView = vscode.window.createTreeView('tabsOnLeft', {
        treeDataProvider: provider,
        showCollapseAll: false
    });

    // Refresh whenever tabs change (open, close, switch, dirty state, etc.)
    const tabChange = vscode.window.tabGroups.onDidChangeTabs(() => provider.refresh());

    const openTabCmd = vscode.commands.registerCommand(
        'tabsOnLeft.openTab',
        async (uri: vscode.Uri, tab: vscode.Tab) => {
            try {
                if (uri) {
                    await vscode.window.showTextDocument(uri, {
                        preview: false,
                        preserveFocus: false
                    });
                }
            } catch {
                // Fallback for non-text tabs (settings, extensions page, etc.)
                vscode.window.showInformationMessage(`Can't navigate to: ${tab.label}`);
            }
        }
    );

    const pinTabCmd = vscode.commands.registerCommand('tabsOnLeft.pinTab', async (item: TabItem) => {
        if (!item || !item.uri) return;
        await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.pinEditor');
    });

    const unpinTabCmd = vscode.commands.registerCommand('tabsOnLeft.unpinTab', async (item: TabItem) => {
        if (!item || !item.uri) return;
        await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.unpinEditor');
    });

    const closeTabCmd = vscode.commands.registerCommand('tabsOnLeft.closeTab', async (item: TabItem) => {
        if (!item) return;
        await vscode.window.tabGroups.close(item.tab);
    });

    const closeAllTabsCmd = vscode.commands.registerCommand('tabsOnLeft.closeAllTabs', async () => {
        const allTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
        await vscode.window.tabGroups.close(allTabs);
    });

    const closeOtherTabsCmd = vscode.commands.registerCommand('tabsOnLeft.closeOtherTabs', async (item: TabItem) => {
        if (!item) return;
        const others = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .filter(t => t !== item.tab);
        await vscode.window.tabGroups.close(others);
    });

    const closeAllButPinnedCmd = vscode.commands.registerCommand('tabsOnLeft.closeAllButPinned', async () => {
        const unpinned = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .filter(t => !t.isPinned);
        await vscode.window.tabGroups.close(unpinned);
    });

    const refreshCmd = vscode.commands.registerCommand('tabsOnLeft.refresh', () => {
        provider.refresh();
    });

    context.subscriptions.push(
        treeView, tabChange,
        openTabCmd, pinTabCmd, unpinTabCmd,
        closeTabCmd, closeAllTabsCmd, closeOtherTabsCmd, closeAllButPinnedCmd,
        refreshCmd
    );
}

export function deactivate() {}
