import boto3
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from app.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Handles file upload/download to Amazon S3."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                self._client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_REGION,
                )
            except NoCredentialsError:
                logger.warning("AWS credentials not configured — S3 uploads will be skipped.")
                self._client = None
        return self._client

    def upload_file(self, file_path: str, s3_key: str) -> bool:
        """Upload a local file to S3. Returns True on success."""
        if not self.client:
            logger.warning("S3 client not available — skipping upload.")
            return False
        try:
            self.client.upload_file(
                file_path,
                settings.S3_BUCKET_NAME,
                s3_key,
                ExtraArgs={"ContentType": "application/octet-stream"},
            )
            logger.info(f"Uploaded to S3: s3://{settings.S3_BUCKET_NAME}/{s3_key}")
            return True
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return False

    def upload_bytes(self, data: bytes, s3_key: str) -> bool:
        """Upload bytes directly to S3."""
        if not self.client:
            logger.warning("S3 client not available — skipping upload.")
            return False
        try:
            self.client.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=s3_key,
                Body=data,
                ContentType="application/octet-stream",
            )
            logger.info(f"Uploaded to S3: s3://{settings.S3_BUCKET_NAME}/{s3_key}")
            return True
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return False

    def generate_presigned_url(self, s3_key: str, expiration: int = 3600) -> str | None:
        """Generate a presigned download URL."""
        if not self.client:
            return None
        try:
            url = self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=expiration,
            )
            return url
        except ClientError as e:
            logger.error(f"Presigned URL generation failed: {e}")
            return None


s3_service = S3Service()
