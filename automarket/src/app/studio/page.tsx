    // 2. Create DB record
      const { data: record, error: dbErr } = await supabase
        .from('am_content')
        .insert({
          idea_text: idea.trim(),
          image_urls: imageUrls,
          platform, content_type: contentType, tone,
          status: 'draft',
        })
        .select()
        .single();

      if (dbErr || !record) {
        setError(`DB error: ${dbErr?.message ?? dbErr?.code ?? 'unknown — check Supabase env vars'}`);
        setStep('input');
        return;
      }