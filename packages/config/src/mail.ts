import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { configuration } from "./index.js";

export class DeliveryError extends Error {
  constructor(readonly permanent: boolean) {
    super(permanent ? "EMAIL_PERMANENT_FAILURE" : "EMAIL_TEMPORARY_FAILURE");
  }
}
export async function sendTransactionalMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  const config = configuration();
  if (config.MAIL_TRANSPORT === "ses") {
    const ses = new SESv2Client({ region: config.AWS_REGION, maxAttempts: 3 });
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: `"${config.FROM_NAME.replaceAll('"', "")}" <${config.MAIL_FROM}>`,
          ReplyToAddresses: config.REPLY_TO ? [config.REPLY_TO] : undefined,
          Destination: { ToAddresses: [message.to] },
          ConfigurationSetName: config.SES_CONFIGURATION_SET,
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: { Text: { Data: message.text, Charset: "UTF-8" } },
            },
          },
        }),
      );
      return { message: null };
    } catch (error) {
      const name = (error as { name?: string }).name;
      throw new DeliveryError(
        [
          "MessageRejected",
          "BadRequestException",
          "MailFromDomainNotVerifiedException",
          "AccountSuspendedException",
        ].includes(name ?? ""),
      );
    } finally {
      ses.destroy();
    }
  }
  const stream = config.MAIL_TRANSPORT !== "smtp";
  if (config.NODE_ENV === "production" && stream) throw new DeliveryError(true);
  const transport = stream
    ? nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: "unix",
      })
    : nodemailer.createTransport(config.SMTP_URL!);
  try {
    const result = await transport.sendMail({
      ...message,
      from: {
        name: config.FROM_NAME,
        address: config.MAIL_FROM ?? "obras@example.test",
      },
      ...(config.REPLY_TO ? { replyTo: config.REPLY_TO } : {}),
    });
    return { message: stream ? (result.message as Buffer) : null };
  } catch (error) {
    const status = (error as { responseCode?: number }).responseCode ?? 0;
    throw new DeliveryError(status >= 500 && status < 600);
  } finally {
    transport.close();
  }
}
