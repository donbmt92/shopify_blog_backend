const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const app = express();

app.use(cors());
app.use(express.json());

// Cấu hình multer để xử lý file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

const SHOP = '0qqeb5-wt.myshopify.com'; // đổi thành shop của mày
const ACCESS_TOKEN = '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'; // token admin API

// === LẤY DANH SÁCH BLOG ===
app.get('/blogs', async (req, res) => {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2025-07/blogs.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN } }
    );

    res.json(response.data.blogs);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === LẤY DANH SÁCH ARTICLE TRONG BLOG ===
app.get('/blogs/:blogId/articles', async (req, res) => {
  const { blogId } = req.params;
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2025-07/blogs/${blogId}/articles.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN } }
    );
    res.json(response.data.articles);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === TẠO ARTICLE ===
app.post('/blogs/:blogId/articles', async (req, res) => {
  const { blogId } = req.params;
  const { title, body_html } = req.body;
  try {
    const response = await axios.post(
      `https://${SHOP}/admin/api/2025-07/blogs/${blogId}/articles.json`,
      { article: { title, body_html } },
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' } }
    );
    res.json(response.data.article);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === SỬA ARTICLE ===
app.put('/blogs/:blogId/articles/:articleId', async (req, res) => {
  const { blogId, articleId } = req.params;
  const { title, body_html } = req.body;
  try {
    const response = await axios.put(
      `https://${SHOP}/admin/api/2025-07/blogs/${blogId}/articles/${articleId}.json`,
      { article: { title, body_html } },
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' } }
    );
    res.json(response.data.article);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === XÓA ARTICLE ===
app.delete('/blogs/:blogId/articles/:articleId', async (req, res) => {
  const { blogId, articleId } = req.params;
  try {
    await axios.delete(
      `https://${SHOP}/admin/api/2025-07/blogs/${blogId}/articles/${articleId}.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === LẤY DANH SÁCH SẢN PHẨM ===
app.get('/products', async (req, res) => {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2025-07/products.json`,
      { headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN } }
    );
    console.log(`https://${SHOP}/admin/api/2025-07/products.json`, response.data);
    
    res.json(response.data.products);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// === UPLOAD HÌNH ẢNH LÊN SHOPIFY ===
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được upload' });
    }

    const file = req.file;
    const filename = file.originalname;
    const mimeType = file.mimetype;
    const fileSize = file.size.toString();

    // Bước 1: Tạo staged upload URL
    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const stagedUploadResponse = await axios.post(
      `https://${SHOP}/admin/api/2025-07/graphql.json`,
      {
        query: stagedUploadMutation,
        variables: {
          input: [{
            filename: filename,
            mimeType: mimeType,
            resource: 'IMAGE',
            fileSize: fileSize
          }]
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const stagedTarget = stagedUploadResponse.data.data.stagedUploadsCreate.stagedTargets[0];
    
    if (stagedUploadResponse.data.data.stagedUploadsCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Lỗi tạo upload URL', 
        details: stagedUploadResponse.data.data.stagedUploadsCreate.userErrors 
      });
    }

    // Debug log
    console.log('Staged upload response:', JSON.stringify(stagedUploadResponse.data, null, 2));
    console.log('Staged target:', JSON.stringify(stagedTarget, null, 2));

    // Bước 2: Upload file lên Shopify storage
    // URL đã có đầy đủ signature parameters, chỉ cần upload file trực tiếp
    console.log('Upload URL:', stagedTarget.url);
    
    // Upload file trực tiếp với PUT method (vì URL đã có signature)
    const uploadResponse = await axios.put(stagedTarget.url, file.buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileSize
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (uploadResponse.status === 200 || uploadResponse.status === 204) {
      // Trả về URL của hình ảnh đã upload
      res.json({
        success: true,
        imageUrl: stagedTarget.resourceUrl,
        filename: filename,
        fileSize: fileSize
      });
    } else {
      res.status(500).json({ error: 'Lỗi upload file lên Shopify' });
    }

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ 
      error: 'Lỗi upload hình ảnh', 
      details: err.response?.data || err.message 
    });
  }
});

app.listen(3000, () => console.log('Backend running on port 3000'));