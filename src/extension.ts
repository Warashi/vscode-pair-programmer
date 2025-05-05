import * as vscode from 'vscode';

interface State {
    bufferContent: Map<string, string>;
    chatPanel: vscode.WebviewPanel | null;
}

const state: State = {
    bufferContent: new Map(),
    chatPanel: null,
};

async function sendDiffToChatModel(diff: string) {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
        vscode.window.showInformationMessage('No chat models available');
        return;
    }
    const model = models[0];
    const res = await model.sendRequest([
        vscode.LanguageModelChatMessage.User(`\`\`\`diff\n${diff}\n\`\`\``)
    ]);

    let responseText = '';
    for await (const message of res.text) {
        responseText += message;
    }

    updateChatPanel(responseText);
}

function updateChatPanel(content: string) {
    if (!state.chatPanel) {
        state.chatPanel = vscode.window.createWebviewPanel(
            'pairProgrammerChat',
            'Pair Programmer Chat',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        state.chatPanel.onDidDispose(() => {
            state.chatPanel = null;
        });
    }

    // Maintain a history of chat messages
    const previousContent = state.chatPanel.webview.html || getWebviewContent('');
    const historyMatch = previousContent.match(/<div id="history">([\s\S]*?)<\/div>/);
    const history = historyMatch ? historyMatch[1] : '';

    const updatedHistory = `${history}<pre>${content}</pre>`;

    state.chatPanel.webview.html = getWebviewContent(updatedHistory);
}

function getWebviewContent(history: string): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pair Programmer Chat</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 10px; }
                pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
                #history { margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>Chat Response</h2>
            <div id="history">${history}</div>
        </body>
        </html>
    `;
}

function computeDiff(oldContent: string, newContent: string): string | null {
    if (oldContent === newContent) {
        return null;
    }
    // Simple diff computation (line-by-line)
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    oldLines.forEach((line, index) => {
        if (line !== newLines[index]) {
            diff.push(`- ${line}`);
        }
    });

    newLines.forEach((line, index) => {
        if (line !== oldLines[index]) {
            diff.push(`+ ${line}`);
        }
    });

    return diff.join('\n');
}

function trackBufferChanges(editor: vscode.TextEditor) {
    const document = editor.document;
    const uri = document.uri.toString();
    const oldContent = state.bufferContent.get(uri) || '';
    const newContent = document.getText();

    const diff = computeDiff(oldContent, newContent);
    if (diff) {
        sendDiffToChatModel(diff);
        state.bufferContent.set(uri, newContent);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('pair-programmer.start', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found');
            return;
        }

        const document = editor.document;
        state.bufferContent.set(document.uri.toString(), document.getText());

        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === document) {
                trackBufferChanges(editor);
            }
        });

        vscode.window.showInformationMessage('Pair programming session started!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    if (state.chatPanel) {
        state.chatPanel.dispose();
    }
}
