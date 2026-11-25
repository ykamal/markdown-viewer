use objc2_app_kit::{NSPrintInfo, NSWindow};
use objc2_web_kit::WKWebView;
use tauri::webview::PlatformWebview;

const MM_TO_PT: f64 = 72.0 / 25.4;
const VERTICAL_MARGIN: f64 = 20.0 * MM_TO_PT;
const HORIZONTAL_MARGIN: f64 = 18.0 * MM_TO_PT;

pub fn print(webview: PlatformWebview) {
    unsafe {
        let view = &*webview.inner().cast::<WKWebView>();
        let window = &*webview.ns_window().cast::<NSWindow>();

        let info = NSPrintInfo::sharedPrintInfo();
        info.setTopMargin(VERTICAL_MARGIN);
        info.setBottomMargin(VERTICAL_MARGIN);
        info.setLeftMargin(HORIZONTAL_MARGIN);
        info.setRightMargin(HORIZONTAL_MARGIN);

        let operation = view.printOperationWithPrintInfo(&info);
        operation.setCanSpawnSeparateThread(true);
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            window,
            None,
            None,
            std::ptr::null_mut(),
        );
    }
}
