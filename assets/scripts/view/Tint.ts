import { _decorator, Color, Component, MeshRenderer } from 'cc';

const { ccclass, property, requireComponent } = _decorator;

/**
 * 给共用材质的模型上色（灰盒与占位陈设用）。颜色在预制体里设置；
 * 正式 Blender 模型自带材质时不需要它（文档 17）。
 */
@ccclass('Tint')
@requireComponent(MeshRenderer)
export class Tint extends Component {
    @property(Color) color: Color = new Color(255, 255, 255, 255);

    onLoad(): void { this.apply(this.color); }

    apply(c: Color): void {
        this.color = c.clone();
        this.getComponent(MeshRenderer)?.getMaterialInstance(0)?.setProperty('mainColor', c);
    }
}
