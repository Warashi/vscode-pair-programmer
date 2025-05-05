# pair-programmer README

## Features

This extension provides a pair programming experience by integrating a chat model with Visual Studio Code. It allows users to collaborate in real-time, track changes, and communicate through a chat interface.

## Requirements

- Access to a chat model that supports the `vscode.lm` API.

## Commands

This extension provides the following commands:

- `pair-programmer.start`: Starts a pair programming session, initializing buffers and opening the chat panel.
- `pair-programmer.stop`: Stops the pair programming session and clears all buffers and chat history.

## Extension Settings
This extension contributes the following settings:
- `pair-programmer.customInstructions`: Custom instructions for the chat model.
- `pair-programmer.chatModel`: The chat model to be used for the pair programming session.

## Known Issues

- The extension assumes the availability of a chat model. If no models are available, it will display an information message.
- Diff computation is line-based and may not handle complex changes optimally.

## Release Notes

### 1.0.0

- Initial release of the Pair Programmer extension.
- Features include real-time diff tracking, chat integration, and a webview panel for chat history.
