use winmd_core::Result;

pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>> {
    let pixels = u64::from(width) * u64::from(height);
    if pixels == 0 || pixels > 16 * 1024 * 1024 || pixels * 4 != rgba.len() as u64 {
        return Err("貼り付け画像は16メガピクセル以下のRGBA画像にしてください。".into());
    }
    let mut bytes = vec![1]; // Raw IPC discriminator: PNG (text uses 0).
    {
        let mut encoder = png::Encoder::new(&mut bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
        writer.finish().map_err(|e| e.to_string())?;
    }
    if bytes.len() > winmd_core::paste::MAX_PNG_BYTES + 1 {
        return Err("PNGに変換した画像が16 MiBを超えています。".into());
    }
    Ok(bytes)
}
