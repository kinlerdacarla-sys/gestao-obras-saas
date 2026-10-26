import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cache, Database } from "../platform.js";
import { Public } from "../auth/security.js";
@Public()
@Controller("health")
class HealthController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Cache) private readonly cache: Cache,
  ) {}
  @Get("live") live() {
    return { api: "up" };
  }
  @Get("ready") ready() {
    return this.health();
  }
  @Get() async health() {
    const [pg, redis] = await Promise.allSettled([
      this.db.$queryRaw`SELECT 1`,
      this.cache.ping(),
    ]);
    const result = {
      api: "up",
      postgresql: pg.status === "fulfilled" ? "up" : "down",
      redis: redis.status === "fulfilled" ? "up" : "down",
    };
    if (pg.status === "rejected" || redis.status === "rejected")
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Dependência indisponível",
        details: [result],
      });
    return result;
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
