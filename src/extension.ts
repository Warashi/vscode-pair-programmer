import * as vscode from 'vscode';

interface State {
    bufferContent: Map<string, string>;
}

const state: State = {
    bufferContent: new Map(),
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
    for await (const message of res.text) {
        console.log(message);
    }
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
    const disposableStart = vscode.commands.registerCommand('pair-programmer.start', () => {
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

    context.subscriptions.push(disposableStart);
}

// This method is called when your extension is deactivated
export function deactivate() {}
