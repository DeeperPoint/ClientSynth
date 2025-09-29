# Client Synth - Setup & Testing Guide

## 🚀 Quick Start Checklist

### ✅ 1. Environment Setup (COMPLETED)
Your environment variables are properly configured:
- ✅ Supabase URL and keys
- ✅ OpenRouter API key for AI text generation
- ✅ AWS S3 credentials for file storage
- ✅ Database connection strings

### ✅ 2. Dependencies (COMPLETED)
All npm packages are installed and the project builds successfully.

---

## 🗄️ Database Setup

### Step 1: Run Database Migrations
Execute the SQL scripts in order to set up your Supabase database:

```bash
# Connect to your Supabase database and run these scripts in order:
```

**Migration Order:**
1. `scripts/001_create_core_schema.sql` - Core multi-tenant tables
2. `scripts/002_profile_trigger.sql` - User profile triggers
3. `scripts/003_tenant_onboarding.sql` - Tenant creation functions
4. `scripts/004_job_system_enhancements.sql` - Job tracking tables
5. `scripts/005_export_system.sql` - Export functionality
6. `scripts/006_media_system.sql` - Image/media management
7. `scripts/008_fix_rls_policies.sql` - Row Level Security fixes
8. `scripts/009_fix_rls_recursion_final.sql` - Final RLS policies
9. `scripts/010_enhanced_job_system.sql` - Enhanced job features
10. `scripts/011_job_controls_system.sql` - Job control system
11. `scripts/012_add_missing_job_columns.sql` - Additional job columns
12. `scripts/013_seeding_infrastructure.sql` - Seeding system
13. `scripts/014_google_drive_integration.sql` - Google Drive integration
14. `scripts/015_intelligence_layer.sql` - ML and analytics

### Step 2: Verify Database Setup
Check that these tables exist in your Supabase database:
- `tenants`
- `profiles`
- `user_tenant_roles`
- `schemas`
- `jobs`
- `generated_data`
- `job_logs`
- `job_controls`
- `media`
- `exports`

---

## 🔧 External Services Configuration

### 1. Supabase Setup
- ✅ **URL**: `https://sntggkfanhpxholkvgqz.supabase.co`
- ✅ **Anon Key**: Configured
- ✅ **Service Role Key**: Configured

**Action Required**: Run the database migrations above.

### 2. OpenRouter AI Service
- ✅ **API Key**: `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`

**Test the connection:**
```bash
curl -H "Authorization: Bearer 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" \
     https://openrouter.ai/api/v1/models
```

### 3. AWS S3 Storage
- ✅ **Access Key**: `AKIAYH6ACZ5NVXOYUA7K`
- ✅ **Secret Key**: Configured
- ✅ **Bucket**: `grainplaza-synthetic-data-bucket`
- ✅ **Region**: `us-east-2`

**Test S3 access:**
```bash
aws s3 ls s3://grainplaza-synthetic-data-bucket --region us-east-2
```

### 4. Fal AI (Optional - for image generation)
**Action Required**: Add FAL_KEY to your environment variables if you want AI image generation.

---

## 🧪 Testing the Application

### Step 1: Start the Development Server
```bash
npm run dev
```

### Step 2: Test Core Functionality

#### A. Authentication Flow
1. **Visit**: `http://localhost:3000`
2. **Sign Up**: Create a new account
3. **Email Confirmation**: Check your email and confirm
4. **Login**: Sign in with your credentials
5. **Dashboard Access**: Should redirect to `/dashboard`

#### B. Schema Creation
1. **Navigate**: `/dashboard/schema/new`
2. **Create Schema**: 
   - Name: "Test Customer Profile"
   - Description: "Testing schema creation"
   - Add fields:
     - `first_name` (Name, AI-generated)
     - `email` (Email, AI-generated)
     - `company` (Company, AI-generated)
     - `profile_image` (Image, AI-generated)
3. **Save**: Should redirect to schemas list

#### C. Data Generation
1. **Select Schema**: Click on your created schema
2. **Generate Data**: 
   - Click "Generate Data"
   - Set records: 5
   - Click "Start Generation"
3. **Monitor Progress**: Watch real-time progress updates
4. **Verify Results**: Check generated data in the job details

#### D. Export System
1. **Job Details**: Go to the completed job
2. **Export**: Click "Export Data"
3. **Select Format**: Try CSV, JSON, XLSX
4. **Download**: Verify file downloads correctly

### Step 3: Test AI Integration

#### A. Text Generation
- Create a schema with AI-powered fields (Name, Email, Company, etc.)
- Generate data and verify realistic content is created
- Check that AI-generated content is contextually relevant

#### B. Image Generation
- Add an "Image" field to your schema
- Generate data and verify images are created
- Check that images are uploaded to S3 and URLs are generated

---

## 🔍 Troubleshooting

### Common Issues & Solutions

#### 1. Build Warnings
**Issue**: Supabase realtime warnings during build
**Solution**: These are non-critical warnings about Edge Runtime compatibility. The app will work fine.

#### 2. Database Connection Issues
**Issue**: "Failed to fetch data" errors
**Solution**: 
- Verify Supabase URL and keys are correct
- Check that database migrations have been run
- Ensure RLS policies are properly configured

#### 3. AI Generation Failures
**Issue**: AI generation returns fallback values
**Solution**:
- Check OpenRouter API key is valid
- Verify API quota/credits are available
- Check network connectivity to OpenRouter

#### 4. S3 Upload Issues
**Issue**: Images not uploading to S3
**Solution**:
- Verify AWS credentials are correct
- Check S3 bucket permissions
- Ensure bucket exists in the specified region

#### 5. Authentication Issues
**Issue**: Users can't sign up or login
**Solution**:
- Check Supabase Auth settings
- Verify email confirmation is configured
- Check RLS policies for profiles table

---

## 📊 Performance Testing

### Load Testing
1. **Create Multiple Schemas**: Test with 10+ different schemas
2. **Large Data Generation**: Generate 1000+ records
3. **Concurrent Users**: Test with multiple browser sessions
4. **Export Performance**: Test exports with large datasets

### Monitoring
- **Database Performance**: Monitor Supabase dashboard
- **API Response Times**: Check browser dev tools
- **Memory Usage**: Monitor during large data generation
- **Error Rates**: Check console logs and Supabase logs

---

## 🚀 Production Deployment

### Vercel Deployment
1. **Connect Repository**: Link your GitHub repo to Vercel
2. **Environment Variables**: Add all required env vars in Vercel dashboard
3. **Deploy**: Push to main branch for automatic deployment
4. **Domain**: Configure custom domain if needed

### Production Checklist
- [ ] All environment variables configured
- [ ] Database migrations completed
- [ ] S3 bucket configured with proper permissions
- [ ] OpenRouter API key has sufficient credits
- [ ] Custom domain configured (optional)
- [ ] Analytics tracking enabled
- [ ] Error monitoring set up

---

## 📈 Success Metrics

### Functional Tests
- [ ] User can sign up and login
- [ ] Schema creation works with all field types
- [ ] Data generation completes successfully
- [ ] AI-generated content is realistic and relevant
- [ ] Images are generated and uploaded to S3
- [ ] Exports work in all supported formats
- [ ] Real-time job updates work correctly
- [ ] Multi-tenant isolation is maintained

### Performance Benchmarks
- [ ] Page load times < 2 seconds
- [ ] Data generation: 10 records/second
- [ ] Export generation: < 30 seconds for 1000 records
- [ ] AI generation: < 5 seconds per field
- [ ] Image generation: < 30 seconds per image

---

## 🆘 Getting Help

### Debug Information
If you encounter issues, collect this information:
1. **Browser Console Logs**: Check for JavaScript errors
2. **Network Tab**: Check for failed API requests
3. **Supabase Logs**: Check database and auth logs
4. **Environment Variables**: Verify all are set correctly
5. **Database Schema**: Confirm all tables exist

### Support Resources
- **Documentation**: Check `CODEBASE_INDEX.md` for architecture details
- **Database Schema**: Review migration scripts in `scripts/` folder
- **API Endpoints**: Check `app/api/` routes for available endpoints
- **Components**: Review `components/` for UI functionality

---

## ✅ Final Verification

Once everything is set up, you should be able to:

1. **Sign up** for a new account
2. **Create a schema** with multiple field types
3. **Generate synthetic data** using AI
4. **Export data** in multiple formats
5. **View real-time progress** during generation
6. **Manage multiple tenants** (organizations)
7. **Generate AI images** and store them in S3

The application is now ready for use! 🎉
