import * as vscode from 'vscode';

interface State {
    sendBuffer: Map<string, NodeJS.Timeout>;
    bufferContent: Map<string, string>;
    chatPanel: vscode.WebviewPanel | null;
    chatHistory: vscode.LanguageModelChatMessage[]; // Changed to use vscode.LanguageModelChatMessage[]
}

const state: State = {
    sendBuffer: new Map(),
    bufferContent: new Map(),
    chatPanel: null,
    chatHistory: [], // Initialize as an empty array
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

    const res = await model.sendRequest([
        vscode.LanguageModelChatMessage.User(systemPrompt),
        ...state.chatHistory,
        vscode.LanguageModelChatMessage.User(`New diff:\n\n\`\`\`diff\n${diff}\n\`\`\``)
    ]);

    let responseText = '';
    for await (const message of res.text) {
        responseText += message;
    }

    updateChatPanel(diff, responseText);
}

function updateChatPanel(diff: string, responseText: string) {
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

    // Update the chat history
    state.chatHistory.push(
        vscode.LanguageModelChatMessage.User(`Diff:\n\n\`\`\`diff\n${diff}\n\`\`\``),
        vscode.LanguageModelChatMessage.Assistant(responseText)
    );

    state.chatPanel.webview.html = getWebviewContent(state.chatHistory);
}

function getWebviewContent(history: vscode.LanguageModelChatMessage[]): string {
    const getContent = (message: vscode.LanguageModelChatMessage) => {
        let content = '';
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                content += part.value;
            }
        }
        return content;
    };

    const historyHtml = history.map(entry => {
        if (entry.role === vscode.LanguageModelChatMessageRole.User) {
            return `<details><summary>Sent Diff</summary><pre>${getContent(entry)}</pre></details>`;
        } else if (entry.role === vscode.LanguageModelChatMessageRole.Assistant) {
            return `<pre>${getContent(entry)}</pre>`;
        }
        return '';
    }).join('');

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
            <div id="history">${historyHtml}</div>
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

    const delay = 3000;

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
        // Initialize buffer content for all open text documents
        vscode.workspace.textDocuments.forEach((document) => {
            state.bufferContent.set(document.uri.toString(), document.getText());
        });

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

            state.chatPanel.webview.html = getWebviewContent([]);
        }

        // Track changes for all text documents
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.visibleTextEditors.find(
                (e) => e.document === event.document
            );
            if (editor) {
                trackBufferChanges(editor);
            }
        });

        // Handle save events for all text documents
        vscode.workspace.onDidSaveTextDocument((savedDocument) => {
            const uri = savedDocument.uri.toString();
            const oldContent = state.bufferContent.get(uri) || '';
            const newContent = savedDocument.getText();

            const diff = computeDiff(oldContent, newContent);
            if (diff) {
                sendDiffToChatModel(diff);
                state.bufferContent.set(uri, newContent);
            }
        });

        vscode.window.showInformationMessage('Pair programming session started for all files!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    if (state.chatPanel) {
        state.chatPanel.dispose();
    }
}
