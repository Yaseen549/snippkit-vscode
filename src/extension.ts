import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    // Helper: Get URL configuration from VS Code Settings
    // Defaults to localhost if not set in User Settings
    const getConfig = () => {
        const config = vscode.workspace.getConfiguration('snippkit');
        return {
            apiUrl: config.get<string>('apiUrl') || "",
            frontendUrl: config.get<string>('frontendUrl') || ""
        };
    };

    // 1. Command: Set API Key
    let setKeyCommand = vscode.commands.registerCommand('snippkit.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
            placeHolder: 'sk_live_...',
            prompt: 'Enter your Snippkit API Key',
            password: true,
            ignoreFocusOut: true
        });

        if (key) {
            await context.secrets.store('snippkit_api_key', key);
            vscode.window.showInformationMessage('Snippkit API Key saved successfully!');
        }
    });

    // 2. Command: Save Selection
    let saveSnippetCommand = vscode.commands.registerCommand('snippkit.saveSelection', async () => {
        
        // A. Get Editor & Text
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file is open!');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showErrorMessage('No text selected! Highlight some code first.');
            return;
        }

        // B. Get API Key
        const apiKey = await context.secrets.get('snippkit_api_key');
        if (!apiKey) {
            const action = await vscode.window.showErrorMessage(
                'No API Key found. Please set it first.',
                'Set API Key'
            );
            if (action === 'Set API Key') {
                vscode.commands.executeCommand('snippkit.setApiKey');
            }
            return;
        }

        // --- INPUTS ---
        const title = await vscode.window.showInputBox({
            prompt: "Name your snippet",
            placeHolder: "My awesome function",
            ignoreFocusOut: true
        });
        if (title === undefined) return; 

        const visibility = await vscode.window.showQuickPick(
            [
                { label: 'Private', description: 'Only you can see this (Encrypted)' }, 
                { label: 'Public', description: 'Anyone with the link can see this' }
            ],
            { placeHolder: 'Select visibility', ignoreFocusOut: true }
        );
        if (!visibility) return; 

        const detectedLang = editor.document.languageId;
        const language = await vscode.window.showInputBox({
            prompt: "Confirm Language",
            value: detectedLang,
            placeHolder: "javascript",
            ignoreFocusOut: true
        });
        if (language === undefined) return;

        const tagsInput = await vscode.window.showInputBox({
            prompt: "Tags (comma separated)",
            placeHolder: "react, hooks, api",
            ignoreFocusOut: true
        });
        if (tagsInput === undefined) return;

        const slug = await vscode.window.showInputBox({
            prompt: "Custom URL Slug (Pro+ Users Only)",
            placeHolder: "my-custom-url-name (Leave empty to auto-generate)",
            ignoreFocusOut: true
        });
        if (slug === undefined) return;


        // E. Prepare Data
        const tagArray = tagsInput 
            ? tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0) 
            : [];
        
        // Variables to hold the result AFTER the loading bar finishes
        let apiResult: any = null;
        let errorMsg: string | null = null;
        
        // Load config dynamically
        const config = getConfig();

        // --- F. SEND TO API (With Loading Bar) ---
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Saving to Snippkit...",
            cancellable: false
        }, async (progress) => {
            try {
                const response = await fetch(config.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        code: text,
                        language: language || "text",
                        title: title || "VS Code Snippet",
                        is_public: visibility.label === 'Public',
                        tags: tagArray,
                        ...(slug ? { slug } : {}) 
                    })
                });

                if (response.ok) {
                    apiResult = await response.json();
                } else {
                    const errData = await response.json() as any;
                    errorMsg = `Failed: ${errData.error || response.statusText}`;
                }
            } catch (error) {
                errorMsg = `Network Error: ${error}`;
            }
        });

        // --- G. SHOW RESULT (Outside Progress Bar) ---
        // This ensures the "Saving..." spinner disappears immediately
        if (apiResult) {
            const btn = await vscode.window.showInformationMessage(
                `Snippet "${title}" saved successfully!`,
                "Copy Link"
            );
            
            // Generate link based on Settings URL
            if (btn === "Copy Link" && apiResult?.data?.id) {
                // If the API returned a slug (because user is Pro), use it
                // Otherwise use the ID
                const identifier = apiResult.data.slug || apiResult.data.id;
                
                // Construct link: http://localhost:3000/s/[identifier]
                const link = `${config.frontendUrl}/s/${identifier}`;
                vscode.env.clipboard.writeText(link);
            }
        } else if (errorMsg) {
            vscode.window.showErrorMessage(errorMsg);
        }
    });

    context.subscriptions.push(setKeyCommand);
    context.subscriptions.push(saveSnippetCommand);
}

export function deactivate() {}