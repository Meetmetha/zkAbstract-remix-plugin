use crate::handlers::process::{do_process_command, fetch_process_result};
use crate::handlers::types::{ApiCommand, ApiCommandResult, CompileResponse, SolFile};
use crate::utils::lib::{ARTIFACTS_ROOT, get_file_ext, get_file_path, HARDHAT_ENV_ROOT, SOL_ROOT};
use crate::worker::WorkerEngine;
use rocket::fs::NamedFile;
use rocket::serde::json;
use rocket::serde::json::Json;
use rocket::tokio::fs;
use rocket::State;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use solang_parser::pt::{ContractPart, Identifier, SourceUnitPart};
use tracing::{debug, instrument};
use tracing_subscriber::fmt::format;

#[instrument]
#[get("/compile/<remix_file_path..>")]
pub async fn compile(remix_file_path: PathBuf) -> Json<CompileResponse> {
    info!("/compile");
    do_compile(remix_file_path)
        .await
        .unwrap_or(Json::from(CompileResponse {
            message: "Error compiling".to_string(),
            status: "error".to_string(),
            file_content: vec![],
        }))
}

#[instrument]
#[get("/compile-async/<remix_file_path..>")]
pub async fn compile_async(
    remix_file_path: PathBuf,
    engine: &State<WorkerEngine>,
) -> String {
    info!("/compile-async");
    do_process_command(ApiCommand::Compile(remix_file_path), engine)
}

#[instrument]
#[get("/compile-result/<process_id>")]
pub async fn get_compile_result(process_id: String, engine: &State<WorkerEngine>) -> String {
    info!("/compile-result");
    fetch_process_result(process_id, engine, |result| match result {
        ApiCommandResult::Compile(compilation_result) => json::to_string(&compilation_result).unwrap(),
        _ => String::from("Result not available"),
    })
}

pub async fn do_compile(
    remix_file_path: PathBuf,
) -> Result<Json<CompileResponse>, String> {
    let remix_file_path = match remix_file_path.to_str() {
        Some(path) => path.to_string(),
        None => {
            return Ok(Json(CompileResponse {
                file_content: vec![],
                message: "File path not found".to_string(),
                status: "FileNotFound".to_string(),
            }));
        }
    };

    match get_file_ext(&remix_file_path) {
        ext if ext == "sol" => {
            debug!("LOG: File extension is sol");
        }
        _ => {
            debug!("LOG: File extension not supported");
            return Ok(Json(CompileResponse {
                file_content: vec![],
                message: "File extension not supported".to_string(),
                status: "FileExtensionNotSupported".to_string(),
            }));
        }
    }

    let file_path = get_file_path(&remix_file_path);

    let mut compile = Command::new("yarn");

    println!("file_path: {:?}", file_path);

    let result = compile
        .arg("compile")
        .current_dir(SOL_ROOT)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    debug!("LOG: ran command:{:?}", compile);


    let output = result.wait_with_output().expect("Failed to wait on child");

    let sol_file_content = fs::read_to_string(&file_path).await.unwrap();

    let (ast, _) = solang_parser::parse(&sol_file_content, 0).unwrap();

    let mut file_name = "".to_string();

    for part in &ast.0 {
        match part {
            SourceUnitPart::ContractDefinition(def) => {
                println!("found contract {:?}", def.name);
                match &def.name {
                    None => {}
                    Some(ident) => {
                        file_name = ident.to_string();
                    }
                }
            }
            _ => (),
        }
    }

    let result_path_prefix = Path::new(ARTIFACTS_ROOT).join(remix_file_path).to_str().unwrap().to_string();
    let mut compiled_contracts: Vec<SolFile> = Vec::new();

    for part in &ast.0 {
        match part {
            SourceUnitPart::ContractDefinition(def) => {
                println!("found contract {:?}", def.name);
                match &def.name {
                    None => {
                        continue;
                    }
                    Some(ident) => {
                        let result_file_path = format!("{}/{}.json", result_path_prefix, ident);
                        let file_content = fs::read_to_string(result_file_path).await.unwrap();
                        let file_name = format!("{}.json", ident);
                        compiled_contracts.push(SolFile {
                            file_name,
                            file_content,
                        });
                    }
                }
            }
            _ => (),
        }
    }
    
    Ok(Json(CompileResponse {
        message: String::from_utf8(output.stderr).unwrap(),
        status: match output.status.code() {
            Some(0) => "Success".to_string(),
            Some(_) => "CompilationFailed".to_string(),
            None => "UnknownError".to_string(),
        },
        file_content: compiled_contracts,
    }))
}
