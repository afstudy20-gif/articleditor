// ARTED desktop shell. Loads the hosted web app
// (https://arted.drtr.uk) in a native window so the server-side
// features (AI, DOI/PubMed lookup, PDF proxy) keep working.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running ARTED");
}
