export function copySelected(text) {
    var _a;
    if ((_a = window.clipboardData) === null || _a === void 0 ? void 0 : _a.setData) {
        window.clipboardData.setData('Text', text);
        return true;
    }
    if (document.queryCommandSupported &&
        document.queryCommandSupported('copy')) {
        const textarea = document.createElement('textarea');
        textarea.textContent = text;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            return true;
        }
        catch (ex) {
            return false;
        }
        finally {
            document.body.removeChild(textarea);
        }
    }
    return false;
}
export function copyShortcut(e) {
    if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
        e.preventDefault();
        document.execCommand('copy');
        return false;
    }
    return true;
}
