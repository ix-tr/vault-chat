// SPDX-License-Identifier: MIT
// Application binding experiment around OpenMLS APIs. No protocol implementation.
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::OpenMlsProvider;
use std::io::Write;
use tls_codec::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const SUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519;
fn err(code: &str) -> JsError {
    JsError::new(code)
}
fn check(bytes: &[u8], max: u32) -> Result<(), JsError> {
    if bytes.is_empty() || bytes.len() > max as usize {
        Err(err("INPUT_LIMIT"))
    } else {
        Ok(())
    }
}
fn decode<T: Deserialize>(bytes: &[u8], max: u32) -> Result<T, JsError> {
    check(bytes, max)?;
    let mut input = bytes;
    let value = T::tls_deserialize(&mut input).map_err(|_| err("INVALID_ENCODING"))?;
    if !input.is_empty() {
        return Err(err("TRAILING_BYTES"));
    }
    Ok(value)
}
fn wire(message: &MlsMessageOut, max: u32) -> Result<Vec<u8>, JsError> {
    let bytes = message
        .tls_serialize_detached()
        .map_err(|_| err("ENCODING_FAILED"))?;
    check(&bytes, max)?;
    Ok(bytes)
}

#[wasm_bindgen]
pub struct Provider {
    inner: OpenMlsRustCrypto,
    max_wire: u32,
    max_snapshot: u32,
}
#[wasm_bindgen]
impl Provider {
    #[wasm_bindgen(constructor)]
    pub fn new(max_wire: u32, max_snapshot: u32) -> Result<Provider, JsError> {
        if max_wire == 0 || max_snapshot < max_wire {
            return Err(err("INVALID_LIMITS"));
        }
        Ok(Self {
            inner: OpenMlsRustCrypto::default(),
            max_wire,
            max_snapshot,
        })
    }
    // Private bytes must stay inside the Worker and be encrypted before storage.
    pub fn snapshot(&self) -> Result<Vec<u8>, JsError> {
        struct BoundedWriter {
            bytes: Vec<u8>,
            max: usize,
        }
        impl Write for BoundedWriter {
            fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                if buf.len() > self.max.saturating_sub(self.bytes.len()) {
                    return Err(std::io::Error::other("SNAPSHOT_LIMIT"));
                }
                self.bytes.extend_from_slice(buf);
                Ok(buf.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let values = self
            .inner
            .storage()
            .values
            .read()
            .map_err(|_| err("STORAGE_FAILED"))?;
        let mut entries: Vec<_> = values.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        let mut writer = BoundedWriter {
            bytes: vec![],
            max: self.max_snapshot as usize,
        };
        serde_json::to_writer(&mut writer, &entries).map_err(|_| err("SNAPSHOT_LIMIT"))?;
        Ok(writer.bytes)
    }
    pub fn restore(bytes: &[u8], max_wire: u32, max_snapshot: u32) -> Result<Provider, JsError> {
        check(bytes, max_snapshot)?;
        let entries: Vec<(Vec<u8>, Vec<u8>)> =
            serde_json::from_slice(bytes).map_err(|_| err("INVALID_SNAPSHOT"))?;
        let provider = Self::new(max_wire, max_snapshot)?;
        {
            let mut values = provider
                .inner
                .storage()
                .values
                .write()
                .map_err(|_| err("STORAGE_FAILED"))?;
            for (key, value) in entries {
                if key.is_empty() || values.insert(key, value).is_some() {
                    return Err(err("INVALID_SNAPSHOT"));
                }
            }
        }
        Ok(provider)
    }
}

#[wasm_bindgen]
pub struct Identity {
    credential: CredentialWithKey,
    signer: SignatureKeyPair,
}
#[wasm_bindgen]
impl Identity {
    #[wasm_bindgen(constructor)]
    pub fn new(provider: &Provider, name: &str) -> Result<Identity, JsError> {
        check(name.as_bytes(), provider.max_wire)?;
        let signer = SignatureKeyPair::new(SignatureScheme::ED25519)
            .map_err(|_| err("KEY_GENERATION_FAILED"))?;
        signer
            .store(provider.inner.storage())
            .map_err(|_| err("STORAGE_FAILED"))?;
        Ok(Self::with_signer(name, signer))
    }
    pub fn restore(
        provider: &Provider,
        name: &str,
        public_key: &[u8],
    ) -> Result<Identity, JsError> {
        check(name.as_bytes(), provider.max_wire)?;
        check(public_key, provider.max_wire)?;
        let signer = SignatureKeyPair::read(
            provider.inner.storage(),
            public_key,
            SignatureScheme::ED25519,
        )
        .ok_or_else(|| err("IDENTITY_NOT_FOUND"))?;
        if signer.public() != public_key {
            return Err(err("IDENTITY_MISMATCH"));
        }
        Ok(Self::with_signer(name, signer))
    }
    pub fn public_key(&self) -> Vec<u8> {
        self.signer.public().to_vec()
    }
    pub fn key_package(&self, provider: &Provider) -> Result<KeyPackage, JsError> {
        let bundle = openmls::key_packages::KeyPackage::builder()
            .build(
                SUITE,
                &provider.inner,
                &self.signer,
                self.credential.clone(),
            )
            .map_err(|_| err("KEY_PACKAGE_FAILED"))?;
        Ok(KeyPackage(bundle.key_package().clone()))
    }
}
impl Identity {
    fn with_signer(name: &str, signer: SignatureKeyPair) -> Self {
        let credential = CredentialWithKey {
            credential: BasicCredential::new(name.as_bytes().to_vec()).into(),
            signature_key: signer.public().into(),
        };
        Self { credential, signer }
    }
}

#[wasm_bindgen]
pub struct KeyPackage(openmls::key_packages::KeyPackage);
#[wasm_bindgen]
impl KeyPackage {
    pub fn to_bytes(&self) -> Result<Vec<u8>, JsError> {
        self.0
            .tls_serialize_detached()
            .map_err(|_| err("ENCODING_FAILED"))
    }
    pub fn from_bytes(provider: &Provider, bytes: &[u8]) -> Result<KeyPackage, JsError> {
        let value: openmls::key_packages::KeyPackageIn = decode(bytes, provider.max_wire)?;
        Ok(Self(
            value
                .validate(provider.inner.crypto(), ProtocolVersion::Mls10)
                .map_err(|_| err("INVALID_KEY_PACKAGE"))?,
        ))
    }
}

#[wasm_bindgen]
pub struct Group(MlsGroup);
#[wasm_bindgen]
impl Group {
    pub fn create_new(
        provider: &Provider,
        identity: &Identity,
        id: &[u8],
    ) -> Result<Group, JsError> {
        check(id, provider.max_wire)?;
        let id = GroupId::from_slice(id);
        if MlsGroup::load(provider.inner.storage(), &id)
            .map_err(|_| err("STORAGE_FAILED"))?
            .is_some()
        {
            return Err(err("GROUP_EXISTS"));
        }
        let group = MlsGroup::builder()
            .ciphersuite(SUITE)
            .with_group_id(id)
            .build(
                &provider.inner,
                &identity.signer,
                identity.credential.clone(),
            )
            .map_err(|_| err("GROUP_CREATE_FAILED"))?;
        Ok(Self(group))
    }
    pub fn load(provider: &Provider, id: &[u8]) -> Result<Group, JsError> {
        check(id, provider.max_wire)?;
        Ok(Self(
            MlsGroup::load(provider.inner.storage(), &GroupId::from_slice(id))
                .map_err(|_| err("STORAGE_FAILED"))?
                .ok_or_else(|| err("GROUP_NOT_FOUND"))?,
        ))
    }
    pub fn group_id(&self) -> Vec<u8> {
        self.0.group_id().as_slice().to_vec()
    }
    pub fn member_indices(&self) -> Vec<u32> {
        self.0.members().map(|m| m.index.u32()).collect()
    }
    pub fn add_messages(
        &mut self,
        provider: &Provider,
        identity: &Identity,
        kp: &KeyPackage,
    ) -> Result<js_sys::Array, JsError> {
        let (commit, welcome, _) = self
            .0
            .add_members(&provider.inner, &identity.signer, &[kp.0.clone()])
            .map_err(|_| err("ADD_FAILED"))?;
        let result = js_sys::Array::new();
        result.push(&js_sys::Uint8Array::from(
            wire(&commit, provider.max_wire)?.as_slice(),
        ));
        result.push(&js_sys::Uint8Array::from(
            wire(&welcome, provider.max_wire)?.as_slice(),
        ));
        self.0
            .merge_pending_commit(&provider.inner)
            .map_err(|_| err("MERGE_FAILED"))?;
        result.push(&js_sys::Uint8Array::from(
            self.tree_bytes(provider)?.as_slice(),
        ));
        Ok(result)
    }
    pub fn tree_bytes(&self, provider: &Provider) -> Result<Vec<u8>, JsError> {
        let bytes = self
            .0
            .export_ratchet_tree()
            .tls_serialize_detached()
            .map_err(|_| err("ENCODING_FAILED"))?;
        check(&bytes, provider.max_wire)?;
        Ok(bytes)
    }
    pub fn join(provider: &Provider, welcome: &[u8], tree: &[u8]) -> Result<Group, JsError> {
        let message: MlsMessageIn = decode(welcome, provider.max_wire)?;
        let welcome = match message.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            _ => return Err(err("WRONG_MESSAGE_KIND")),
        };
        let tree: RatchetTreeIn = decode(tree, provider.max_wire)?;
        let staged = StagedWelcome::new_from_welcome(
            &provider.inner,
            &MlsGroupJoinConfig::builder().build(),
            welcome,
            Some(tree),
        )
        .map_err(|_| err("JOIN_FAILED"))?;
        Ok(Self(
            staged
                .into_group(&provider.inner)
                .map_err(|_| err("JOIN_FAILED"))?,
        ))
    }
    pub fn send(
        &mut self,
        provider: &Provider,
        identity: &Identity,
        bytes: &[u8],
    ) -> Result<Vec<u8>, JsError> {
        check(bytes, provider.max_wire)?;
        let message = self
            .0
            .create_message(&provider.inner, &identity.signer, bytes)
            .map_err(|_| err("SEND_FAILED"))?;
        wire(&message, provider.max_wire)
    }
    pub fn receive(&mut self, provider: &Provider, bytes: &[u8]) -> Result<Vec<u8>, JsError> {
        let message: MlsMessageIn = decode(bytes, provider.max_wire)?;
        let message = message
            .try_into_protocol_message()
            .map_err(|_| err("WRONG_MESSAGE_KIND"))?;
        let processed = self
            .0
            .process_message(&provider.inner, message)
            .map_err(|_| err("MESSAGE_REJECTED"))?;
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(m) => Ok(m.into_bytes()),
            ProcessedMessageContent::ProposalMessage(p)
            | ProcessedMessageContent::ExternalJoinProposalMessage(p) => {
                self.0
                    .store_pending_proposal(provider.inner.storage(), *p)
                    .map_err(|_| err("STORAGE_FAILED"))?;
                Ok(vec![])
            }
            ProcessedMessageContent::StagedCommitMessage(c) => {
                self.0
                    .merge_staged_commit(&provider.inner, *c)
                    .map_err(|_| err("MERGE_FAILED"))?;
                Ok(vec![])
            }
            ProcessedMessageContent::OwnPendingCommit => {
                self.0
                    .merge_pending_commit(&provider.inner)
                    .map_err(|_| err("MERGE_FAILED"))?;
                Ok(vec![])
            }
            ProcessedMessageContent::OwnPrivateMessage => Ok(vec![]),
        }
    }
    pub fn update(&mut self, provider: &Provider, identity: &Identity) -> Result<Vec<u8>, JsError> {
        let bundle = self
            .0
            .self_update(
                &provider.inner,
                &identity.signer,
                LeafNodeParameters::default(),
            )
            .map_err(|_| err("UPDATE_FAILED"))?;
        let (commit, _, _) = bundle.into_contents();
        let bytes = wire(&commit, provider.max_wire)?;
        self.0
            .merge_pending_commit(&provider.inner)
            .map_err(|_| err("MERGE_FAILED"))?;
        Ok(bytes)
    }
    pub fn remove(
        &mut self,
        provider: &Provider,
        identity: &Identity,
        index: u32,
    ) -> Result<Vec<u8>, JsError> {
        if index == self.0.own_leaf_index().u32() {
            return Err(err("SELF_REMOVE_BLOCKED"));
        }
        if !self.0.members().any(|m| m.index.u32() == index) {
            return Err(err("MEMBER_NOT_FOUND"));
        }
        let (commit, _, _) = self
            .0
            .remove_members(
                &provider.inner,
                &identity.signer,
                &[LeafNodeIndex::new(index)],
            )
            .map_err(|_| err("REMOVE_FAILED"))?;
        let bytes = wire(&commit, provider.max_wire)?;
        self.0
            .merge_pending_commit(&provider.inner)
            .map_err(|_| err("MERGE_FAILED"))?;
        Ok(bytes)
    }
}
