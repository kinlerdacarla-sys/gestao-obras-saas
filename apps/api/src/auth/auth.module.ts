import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service.js";
import { Public, type ApiRequest } from "./security.js";
import {
  forgotSchema,
  loginSchema,
  resetSchema,
} from "../../../../packages/validation/src/index.js";
import { NotificationModule } from "../notification/notification.module.js";
import { configuration } from "../../../../packages/config/src/index.js";
import { RequestDoc } from "../docs.js";
@Controller("api/v1/auth")
class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private cookies(res: Response, tokens: { access: string; refresh: string }) {
    const options = {
      httpOnly: true,
      secure: configuration().NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    res.cookie("access", tokens.access, { ...options, maxAge: 15 * 60000 });
    res.cookie("refresh", tokens.refresh, {
      ...options,
      path: "/api/v1/auth",
      maxAge: 7 * 86400000,
    });
    return { message: "Autenticado" };
  }
  @Public()
  @Post("login")
  @HttpCode(200)
  @RequestDoc(loginSchema)
  async login(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookies(
      res,
      await this.auth.login(loginSchema.parse(body), req),
    );
  }
  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookies(
      res,
      await this.auth.refresh(req.cookies.refresh ?? ""),
    );
  }
  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logout(req);
    res.clearCookie("access", { path: "/" });
    res.clearCookie("refresh", { path: "/api/v1/auth" });
    return result;
  }
  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  @RequestDoc(forgotSchema)
  forgot(@Body() body: unknown, @Req() req: ApiRequest) {
    return this.auth.forgot(forgotSchema.parse(body), req);
  }
  @Public()
  @Post("reset-password")
  @HttpCode(200)
  @RequestDoc(resetSchema)
  reset(@Body() body: unknown, @Req() req: ApiRequest) {
    return this.auth.reset(resetSchema.parse(body), req);
  }
  @Get("me") me(@Req() req: ApiRequest) {
    return this.auth.me(req);
  }
}
@Module({
  imports: [NotificationModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
