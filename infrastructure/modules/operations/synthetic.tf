data "archive_file" "synthetic" {
  type        = "zip"
  source_file = "${path.module}/synthetic.py"
  output_path = "${path.root}/.terraform/synthetic.zip"
}
resource "aws_cloudwatch_log_group" "synthetic" {
  name              = "/aws/lambda/${var.name}-synthetic"
  retention_in_days = 30
}
resource "aws_iam_role" "synthetic" {
  name               = "${var.name}-synthetic"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "synthetic" {
  role   = aws_iam_role.synthetic.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.synthetic.arn}:*" }] })
}
resource "aws_lambda_function" "synthetic" {
  function_name                  = "${var.name}-synthetic"
  role                           = aws_iam_role.synthetic.arn
  runtime                        = "python3.13"
  handler                        = "synthetic.handler"
  filename                       = data.archive_file.synthetic.output_path
  source_code_hash               = data.archive_file.synthetic.output_base64sha256
  timeout                        = 40
  memory_size                    = 128
  reserved_concurrent_executions = 1
  environment { variables = { APP_URL = "https://${var.app_domain}", API_URL = "https://${var.api_domain}", ENVIRONMENT = var.environment } }
  depends_on = [aws_cloudwatch_log_group.synthetic, aws_iam_role_policy.synthetic]
}
resource "aws_cloudwatch_event_rule" "synthetic" {
  name                = "${var.name}-synthetic"
  schedule_expression = "rate(1 minute)"
}
resource "aws_cloudwatch_event_target" "synthetic" {
  rule = aws_cloudwatch_event_rule.synthetic.name
  arn  = aws_lambda_function.synthetic.arn
}
resource "aws_lambda_permission" "synthetic" {
  statement_id  = "EventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.synthetic.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.synthetic.arn
}
