pub mod document;
pub mod file_io;
pub mod images;
pub mod paste;

pub type Result<T> = std::result::Result<T, String>;

#[cfg(test)]
mod tests;
