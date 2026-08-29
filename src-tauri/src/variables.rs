use crate::error::ApplicationError;
use crate::http::{HttpRequestInput, RequestAuth, RequestBody};
use crate::secrets::SecretStore;
use crate::store::models::StoredVariable;
use crate::testing::RequestAssertion;
use std::collections::{BTreeMap, BTreeSet};

pub fn resolve_request(
    input: &mut HttpRequestInput,
    variables: &BTreeMap<String, StoredVariable>,
    secrets: &SecretStore,
) -> Result<Vec<String>, ApplicationError> {
    let mut resolver = Resolver {
        variables,
        secrets,
        memo: BTreeMap::new(),
        resolving: BTreeSet::new(),
        missing: BTreeSet::new(),
        used_secrets: BTreeSet::new(),
    };

    input.url = resolver.text(&input.url)?;
    for entry in input.params.iter_mut().filter(|entry| entry.enabled) {
        entry.key = resolver.text(&entry.key)?;
        entry.value = resolver.text(&entry.value)?;
    }
    for entry in input.headers.iter_mut().filter(|entry| entry.enabled) {
        entry.key = resolver.text(&entry.key)?;
        entry.value = resolver.text(&entry.value)?;
    }
    match &mut input.body {
        RequestBody::None => {}
        RequestBody::Json { content } | RequestBody::Text { content } => {
            *content = resolver.text(content)?;
        }
        RequestBody::Form { entries } => {
            for entry in entries.iter_mut().filter(|entry| entry.enabled) {
                entry.key = resolver.text(&entry.key)?;
                entry.value = resolver.text(&entry.value)?;
            }
        }
    }
    match &mut input.auth {
        RequestAuth::None => {}
        RequestAuth::Bearer { token } => *token = resolver.text(token)?,
        RequestAuth::Basic { username, password } => {
            *username = resolver.text(username)?;
            *password = resolver.text(password)?;
        }
    }

    if resolver.missing.is_empty() {
        Ok(resolver.used_secrets.into_iter().collect())
    } else {
        Err(ApplicationError::unresolved_variables(
            &resolver.missing.into_iter().collect::<Vec<_>>(),
        ))
    }
}

pub fn resolve_assertions(
    assertions: &mut [RequestAssertion],
    variables: &BTreeMap<String, StoredVariable>,
    secrets: &SecretStore,
) -> Result<Vec<String>, ApplicationError> {
    let mut resolver = Resolver {
        variables,
        secrets,
        memo: BTreeMap::new(),
        resolving: BTreeSet::new(),
        missing: BTreeSet::new(),
        used_secrets: BTreeSet::new(),
    };
    for assertion in assertions {
        assertion.target = resolver.text(&assertion.target)?;
        assertion.expected = resolver.text(&assertion.expected)?;
    }
    if resolver.missing.is_empty() {
        Ok(resolver.used_secrets.into_iter().collect())
    } else {
        Err(ApplicationError::unresolved_variables(
            &resolver.missing.into_iter().collect::<Vec<_>>(),
        ))
    }
}

struct Resolver<'a> {
    variables: &'a BTreeMap<String, StoredVariable>,
    secrets: &'a SecretStore,
    memo: BTreeMap<String, String>,
    resolving: BTreeSet<String>,
    missing: BTreeSet<String>,
    used_secrets: BTreeSet<String>,
}

impl Resolver<'_> {
    fn text(&mut self, text: &str) -> Result<String, ApplicationError> {
        let mut output = String::with_capacity(text.len());
        let mut cursor = 0;
        while let Some(relative_start) = text[cursor..].find("{{") {
            let start = cursor + relative_start;
            output.push_str(&text[cursor..start]);
            let value_start = start + 2;
            let Some(relative_end) = text[value_start..].find("}}") else {
                output.push_str(&text[start..]);
                return Ok(output);
            };
            let end = value_start + relative_end;
            let name = text[value_start..end].trim();
            if name.is_empty() {
                self.missing.insert("(empty variable)".to_owned());
            } else if let Some(value) = self.variable(name)? {
                output.push_str(&value);
            }
            cursor = end + 2;
        }
        output.push_str(&text[cursor..]);
        Ok(output)
    }

    fn variable(&mut self, name: &str) -> Result<Option<String>, ApplicationError> {
        if let Some(value) = self.memo.get(name) {
            return Ok(Some(value.clone()));
        }
        if !self.resolving.insert(name.to_owned()) {
            self.missing.insert(name.to_owned());
            return Ok(None);
        }
        let Some(variable) = self.variables.get(name) else {
            self.resolving.remove(name);
            self.missing.insert(name.to_owned());
            return Ok(None);
        };
        let raw = if variable.is_secret {
            let Some(secret_ref) = variable.secret_ref.as_deref() else {
                self.resolving.remove(name);
                self.missing.insert(name.to_owned());
                return Ok(None);
            };
            self.secrets.get(secret_ref)?
        } else {
            variable.value.clone()
        };
        if variable.is_secret && raw.len() >= 3 {
            self.used_secrets.insert(raw.clone());
        }
        let value = self.text(&raw)?;
        self.resolving.remove(name);
        self.memo.insert(name.to_owned(), value.clone());
        Ok(Some(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(value: &str) -> StoredVariable {
        StoredVariable {
            value: value.to_owned(),
            is_secret: false,
            secret_ref: None,
        }
    }

    #[test]
    fn resolves_nested_values_and_reports_missing_names() {
        let variables = BTreeMap::from([
            ("host".to_owned(), plain("example.com")),
            ("baseUrl".to_owned(), plain("https://{{host}}")),
        ]);
        let temporary = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let secrets = SecretStore::new(&temporary);
        let mut resolver = Resolver {
            variables: &variables,
            secrets: &secrets,
            memo: BTreeMap::new(),
            resolving: BTreeSet::new(),
            missing: BTreeSet::new(),
            used_secrets: BTreeSet::new(),
        };
        assert_eq!(
            resolver.text("{{baseUrl}}/users").unwrap(),
            "https://example.com/users"
        );
        assert_eq!(resolver.text("{{missing}}").unwrap(), "");
        assert!(resolver.missing.contains("missing"));
    }
}
