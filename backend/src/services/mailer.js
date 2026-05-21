const nodemailer = require('nodemailer');

// Ensure you configure these in your .env file
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Send Password Reset Email
 * @param {string} to - Recipient email address
 * @param {string} resetLink - The full URL containing the reset token
 * @param {string} username - User's system ID/username
 * @param {string} displayName - User's display name
 */
async function sendPasswordResetEmail(to, resetLink, username = 'User', displayName = '') {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️ SMTP credentials not configured. Skipping email send. Link:', resetLink);
    return false;
  }

  const nameToShow = displayName || username;

  const mailOptions = {
    from: process.env.FROM_EMAIL || `"Smart Energy" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Security Alert: Password Reset Request',
    text: `You requested a password reset for your Smart Energy account. Please copy and paste the following link into your browser to set a new password: ${resetLink} \n\nThis link will expire in 1 hour.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
    
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f172a; padding: 30px 40px; text-align: left; border-bottom: 3px solid #2563eb;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <h1 style="color: #f8fafc; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                                            ENERGY<span style="color: #94a3b8; font-weight: 400;">SYSTEM</span>
                                        </h1>
                                    </td>
                                    <td align="right" style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
                                        Security Notice
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #0f172a;">Credential Reset Request</h2>
                            
                            <p style="margin: 0 0 15px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                                Dear <strong>${nameToShow}</strong>,
                            </p>
                            
                            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                                We received a request to reset the security credentials associated with the following account:
                            </p>

                            <!-- Account Details Box -->
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 25px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                                <tr>
                                    <td style="padding: 15px 20px;">
                                        <p style="margin: 0 0 5px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Account Profile</p>
                                        <p style="margin: 0; font-size: 14px; color: #0f172a; font-family: monospace;">
                                            <strong>ID:</strong> ${username}<br>
                                            <strong>Email:</strong> ${to}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                                If you initiated this request, please click the button below to establish a new password.
                            </p>

                            <!-- Call to Action -->
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 35px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${resetLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #1d4ed8;">
                                            Initialize Reset
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">
                                If the button is unresponsive, copy and paste this secure link into your browser:
                            </p>
                            <div style="background-color: #f1f5f9; padding: 12px; border-radius: 4px; border: 1px solid #e2e8f0; word-break: break-all;">
                                <a href="${resetLink}" style="color: #2563eb; font-size: 13px; font-family: monospace; text-decoration: none;">${resetLink}</a>
                            </div>

                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                                <tr>
                                    <td style="font-size: 13px; color: #ef4444; font-weight: 600;">
                                        ⚠️ This authorization link will expire in exactly 1 hour.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size: 13px; color: #64748b; line-height: 1.5; padding-top: 8px;">
                                        If you did not request this modification, no further action is required. Your current credentials remain secure.
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
                                SMART Energy Monitoring System
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 11px; color: #cbd5e1;">
                                Automated System Message • Do Not Reply
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
}

/**
 * Send Password Reset OTP Email
 * @param {string} to - Recipient email address
 * @param {string} username - User's system ID/username
 * @param {string} otpCode - 6-digit OTP code
 */
async function sendPasswordResetOtpEmail(to, username, otpCode) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️ SMTP credentials not configured. Skipping OTP email send. OTP:', otpCode);
    return false;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL || `"Smart Energy" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Security Alert: Your Verification Code',
    text: `You are attempting to reset your password. Your 6-digit verification code is: ${otpCode} \n\nThis code will expire in 15 minutes.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
    
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f172a; padding: 30px 40px; text-align: left; border-bottom: 3px solid #f59e0b;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <h1 style="color: #f8fafc; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                                            ENERGY<span style="color: #94a3b8; font-weight: 400;">SYSTEM</span>
                                        </h1>
                                    </td>
                                    <td align="right" style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
                                        Security Notice
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px; text-align: center;">
                            <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #0f172a;">Identity Verification Required</h2>
                            
                            <p style="margin: 0 0 30px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                                To complete your password reset request for account <strong>${username}</strong>, please enter the following 6-digit verification code:
                            </p>

                            <!-- OTP Box -->
                            <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 30px; display: inline-block;">
                                <div style="font-family: 'Courier New', Courier, monospace; font-size: 40px; font-weight: 700; color: #0f172a; letter-spacing: 8px;">${otpCode}</div>
                            </div>

                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: left;">
                                <tr>
                                    <td style="font-size: 13px; color: #ef4444; font-weight: 600;">
                                        ⚠️ This verification code will expire in 15 minutes.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size: 13px; color: #64748b; line-height: 1.5; padding-top: 8px;">
                                        If you did not request a password reset, please secure your account and contact an administrator immediately. Do not share this code with anyone.
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
                                SMART Energy Monitoring System
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 11px; color: #cbd5e1;">
                                Automated System Message • Do Not Reply
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetOtpEmail
};
