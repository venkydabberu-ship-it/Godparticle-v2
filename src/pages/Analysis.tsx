async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !user) return;
  if (!expiry) { setUploadMsg('Please select expiry first!'); return; }
  if (!canUploadIndex(indexName)) {
    setUploadMsg(`You cannot upload ${indexName} data. Upgrade your plan!`);
    return;
  }
  setUploading(true);
  setUploadMsg('');
  try {
    const text = await file.text();
    const parsed = parseNSEOptionChain(text);
    const count = Object.keys(parsed).length;
    if (!count) { setUploadMsg('No valid data found in CSV!'); return; }

    const result = await uploadMarketData(
      indexName,
      expiry,
      csvDate,
      parsed,
      user.id
    );

    // Admin sees full details including duplicate warning
    // Users just see simple success message
    if (profile?.role === 'admin') {
      if (result.status === 'duplicate') {
        setUploadMsg(`⚠️ Data already exists for ${indexName} | ${expiry} | ${csvDate} — Skipped!`);
      } else {
        setUploadMsg(`✅ Saved ${count} strikes for ${indexName} | ${expiry} | ${csvDate}`);
      }
    } else {
      // All users see simple success message
      setUploadMsg(`✅ Data saved — ${count} strikes for ${expiry} | ${csvDate}`);
    }
  } catch (err: any) {
    setUploadMsg(`Error: ${err.message}`);
  } finally {
    setUploading(false);
  }
}
