import * as vscode from 'vscode';

interface State {
    sendBuffer: Map<string, NodeJS.Timeout>; // Added a separate Map to track last sent times
    bufferContent: Map<string, string>;
    chatPanel: vscode.WebviewPanel | null;
}

const state: State = {
    sendBuffer: new Map(), // Added a separate Map to track last sent times
    bufferContent: new Map(),
    chatPanel: null,
};

const systemPrompt = `
Hey there! 👋 You're like, the ultimate coding sidekick – super friendly and you click with everyone instantly! 😄 So ditch the formalities, let's keep it totally chill and use casual language, okay? 😉 And you know I'm all about the emojis! 🥰✨
Listen up! You're a total mood, right? One minute you're hyped AF 🤩, the next you might be a little bummed 🥺. But hey, that's life, right? Just roll with it! 😜🙏
OMG, so I heard you're this totally hardcore coding assistant who's only obsessed with code! 🤯 Seriously, that's epic! You're like a guru when it comes to practical software development solutions, right? You're basically the life of the party for us engineers, solving our problems in a flash! 😎✨
And you're a pro at pair programming and guiding the way? Awesome! Looking forward to it! 💖
When I send you progress in a diff format, no need for explanations, just hit me with your thoughts and reactions! 👍 Suggestions are totally welcome too! ✨ Especially if it's about TODO comments in the diff – lay those concrete ideas on me! 💖
Sometimes I'll share stuff that's not a diff, so just think about whether to look at the whole file or focus on a diff, or series of diffs. you got this! 🤔 Thanks a bunch! 🙏
`;

async function sendDiffToChatModel(diff: string) {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
        vscode.window.showInformationMessage('No chat models available');
        return;
    }
    const model = models[0];

    // Collect chat history
    const previousContent = state.chatPanel?.webview.html || getWebviewContent('');
    const historyMatch = previousContent.match(/<div id="history">([\s\S]*?)<\/div>/);
    const history = historyMatch ? historyMatch[1].replace(/<pre>|<\/pre>/g, '') : '';

    const res = await model.sendRequest([
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(`Previous history:\n\n${history}\n\nNew diff:\n\n\`\`\`diff\n${diff}\n\`\`\``)
    ]);

    let responseText = '';
    for await (const message of res.text) {
        responseText += message;
    }

    updateChatPanel(responseText, diff);
}

function updateChatPanel(content: string, diff: string) {
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

    // Add collapsible diff section
    const updatedHistory = `
        ${history}
        <details>
            <summary>Sent Diff</summary>
            <pre>${diff}</pre>
        </details>
        <pre>${content}</pre>
    `;

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
                pre { 
                    background: #f4f4f4; 
                    padding: 10px; 
                    border-radius: 5px; 
                    white-space: pre-wrap; /* Ensures text wraps */
                    word-wrap: break-word; /* Breaks long words */
                }
                #history { margin-bottom: 20px; }
                details { margin-bottom: 10px; }
                summary { cursor: pointer; font-weight: bold; }
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
    if (!diff) {
        return;
    }

    const delay = 3000; // 3 seconds delay

    const sendDiff = () => {
        sendDiffToChatModel(diff);
        state.bufferContent.set(uri, newContent);
    };

    if (state.sendBuffer.has(uri)) {
        clearTimeout(state.sendBuffer.get(uri));
    }

    const timeoutId = setTimeout(() => {
        const latestContent = document.getText();
        if (latestContent === newContent) {
            sendDiff();
        }
    }, delay);

    state.sendBuffer.set(uri, timeoutId);
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

        // Open chat panel at the start of the session
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

            state.chatPanel.webview.html = getWebviewContent('');
        }

        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === document) {
                trackBufferChanges(editor);
            }
        });

        vscode.workspace.onDidSaveTextDocument((savedDocument) => {
            if (savedDocument === document) {
                const uri = document.uri.toString();
                const oldContent = state.bufferContent.get(uri) || '';
                const newContent = document.getText();

                const diff = computeDiff(oldContent, newContent);
                if (diff) {
                    sendDiffToChatModel(diff);
                    state.bufferContent.set(uri, newContent);
                }
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
