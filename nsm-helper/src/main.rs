use std::env;
use std::fmt;
use std::path::Path;
use std::process;

const USAGE: &str = "\
Usage: nsm-attest --public-key-der-b64 <base64> --nonce-b64 <base64> --user-data-hex <hex>
";

#[derive(Debug, PartialEq, Eq)]
struct AttestationArgs {
    public_key_der: Vec<u8>,
    nonce: Vec<u8>,
    user_data: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
struct CliError(String);

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

fn main() {
    match run(env::args().skip(1)) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("error: {error}");
            eprint!("{USAGE}");
            process::exit(1);
        }
    }
}

fn run(args: impl IntoIterator<Item = String>) -> Result<String, CliError> {
    let args = parse_args(args)?;
    request_attestation(args)
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<AttestationArgs, CliError> {
    let mut public_key_der_b64 = None;
    let mut nonce_b64 = None;
    let mut user_data_hex = None;
    let mut args = args.into_iter();

    while let Some(flag) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| CliError(format!("missing value for {flag}")))?;

        match flag.as_str() {
            "--public-key-der-b64" => set_once(&mut public_key_der_b64, flag, value)?,
            "--nonce-b64" => set_once(&mut nonce_b64, flag, value)?,
            "--user-data-hex" => set_once(&mut user_data_hex, flag, value)?,
            _ => return Err(CliError(format!("unknown argument {flag}"))),
        }
    }

    Ok(AttestationArgs {
        public_key_der: decode_base64(
            "--public-key-der-b64",
            required("--public-key-der-b64", public_key_der_b64)?,
        )?,
        nonce: decode_base64("--nonce-b64", required("--nonce-b64", nonce_b64)?)?,
        user_data: decode_hex("--user-data-hex", required("--user-data-hex", user_data_hex)?)?,
    })
}

fn set_once(slot: &mut Option<String>, flag: String, value: String) -> Result<(), CliError> {
    if slot.replace(value).is_some() {
        return Err(CliError(format!("duplicate argument {flag}")));
    }
    Ok(())
}

fn required(flag: &'static str, value: Option<String>) -> Result<String, CliError> {
    value.ok_or_else(|| CliError(format!("missing required argument {flag}")))
}

fn request_attestation(_args: AttestationArgs) -> Result<String, CliError> {
    if !Path::new("/dev/nsm").exists() {
        return Err(CliError(
            "Nitro Secure Module device /dev/nsm is not available".to_string(),
        ));
    }

    Err(CliError(
        "Nitro Secure Module attestation request is not implemented".to_string(),
    ))
}

fn decode_base64(flag: &'static str, value: String) -> Result<Vec<u8>, CliError> {
    if value.is_empty() {
        return Err(CliError(format!("{flag} must not be empty")));
    }
    if value.len() % 4 != 0 {
        return Err(CliError(format!("{flag} is not valid base64")));
    }

    let mut output = Vec::with_capacity(value.len() / 4 * 3);
    let mut padding_started = false;

    for chunk in value.as_bytes().chunks_exact(4) {
        let mut sextets = [0_u8; 4];
        let mut padding = 0;

        for (index, byte) in chunk.iter().enumerate() {
            match decode_base64_byte(*byte) {
                Some(sextet) if !padding_started => sextets[index] = sextet,
                Some(_) => return Err(CliError(format!("{flag} is not valid base64"))),
                None if *byte == b'=' && index >= 2 => {
                    padding += 1;
                    padding_started = true;
                }
                None => return Err(CliError(format!("{flag} is not valid base64"))),
            }
        }

        if padding > 2 {
            return Err(CliError(format!("{flag} is not valid base64")));
        }
        if padding == 1 && chunk[3] != b'=' {
            return Err(CliError(format!("{flag} is not valid base64")));
        }
        if padding == 2 && (chunk[2] != b'=' || chunk[3] != b'=') {
            return Err(CliError(format!("{flag} is not valid base64")));
        }

        output.push((sextets[0] << 2) | (sextets[1] >> 4));
        if padding < 2 {
            output.push((sextets[1] << 4) | (sextets[2] >> 2));
        }
        if padding == 0 {
            output.push((sextets[2] << 6) | sextets[3]);
        }
    }

    Ok(output)
}

fn decode_base64_byte(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn decode_hex(flag: &'static str, value: String) -> Result<Vec<u8>, CliError> {
    if value.is_empty() {
        return Err(CliError(format!("{flag} must not be empty")));
    }
    if value.len() % 2 != 0 {
        return Err(CliError(format!("{flag} is not valid hex")));
    }

    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = decode_hex_byte(pair[0])
                .ok_or_else(|| CliError(format!("{flag} is not valid hex")))?;
            let low = decode_hex_byte(pair[1])
                .ok_or_else(|| CliError(format!("{flag} is not valid hex")))?;
            Ok((high << 4) | low)
        })
        .collect()
}

fn decode_hex_byte(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_required_arguments() {
        let args = parse_args([
            "--public-key-der-b64".to_string(),
            "AQID".to_string(),
            "--nonce-b64".to_string(),
            "bm9uY2U=".to_string(),
            "--user-data-hex".to_string(),
            "0a0Bff".to_string(),
        ])
        .unwrap();

        assert_eq!(
            args,
            AttestationArgs {
                public_key_der: vec![1, 2, 3],
                nonce: b"nonce".to_vec(),
                user_data: vec![10, 11, 255],
            }
        );
    }

    #[test]
    fn rejects_missing_argument() {
        let error = parse_args([
            "--public-key-der-b64".to_string(),
            "AQID".to_string(),
            "--nonce-b64".to_string(),
            "bm9uY2U=".to_string(),
        ])
        .unwrap_err();

        assert_eq!(
            error,
            CliError("missing required argument --user-data-hex".to_string())
        );
    }

    #[test]
    fn rejects_unknown_argument() {
        let error = parse_args(["--unexpected".to_string(), "value".to_string()]).unwrap_err();

        assert_eq!(error, CliError("unknown argument --unexpected".to_string()));
    }

    #[test]
    fn rejects_duplicate_argument() {
        let error = parse_args([
            "--public-key-der-b64".to_string(),
            "AQID".to_string(),
            "--public-key-der-b64".to_string(),
            "BAUG".to_string(),
        ])
        .unwrap_err();

        assert_eq!(
            error,
            CliError("duplicate argument --public-key-der-b64".to_string())
        );
    }

    #[test]
    fn rejects_invalid_base64() {
        let error = decode_base64("--nonce-b64", "not-base64".to_string()).unwrap_err();

        assert_eq!(
            error,
            CliError("--nonce-b64 is not valid base64".to_string())
        );
    }

    #[test]
    fn rejects_invalid_hex() {
        let error = decode_hex("--user-data-hex", "abc".to_string()).unwrap_err();

        assert_eq!(
            error,
            CliError("--user-data-hex is not valid hex".to_string())
        );
    }
}
